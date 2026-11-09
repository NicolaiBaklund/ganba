import "server-only";
import { earnedStamps, exerciseByKey, isRide, isRun, PR_TYPES, strengthStamps, weekStartOn, type ISODate, type Stamp, type StampKind } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";
import { countryName, countryOf } from "./country";
import { loggedSessions, stampSessions, userExercises } from "@/lib/strength/history";

const db = () => createAdminSupabase();
const num = (v: unknown) => (v == null ? null : Number(v));
/** The API returns at most 1000 rows per request: read long histories in pages. */
const PAGE = 1000;

async function allPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return out;
  }
}

type Move = { id: string; date: ISODate; km: number; country: string | null };
type HistoryItem = { id: number | null; date: string; typeKey: string | null; lat: number | null; lon: number | null; km: number };

/**
 * Runs and rides as stamps see them: km and the country they started in. Synced activities, plus the whole Garmin
 * history (summary only) for what lies before the import; an activity in both counts once.
 */
async function movesOf(userId: string, history: HistoryItem[]): Promise<{ runs: Move[]; rides: Move[] }> {
  const rows = await allPages((from, to) =>
    db()
      .from("activities")
      .select("id, garmin_activity_id, local_date, type_key, distance_m, lat:raw->startLatitude, lon:raw->startLongitude")
      .eq("user_id", userId)
      .order("local_date")
      .order("id")
      .range(from, to),
  );
  const synced = new Set(rows.map((a) => a.garmin_activity_id).filter((x) => x != null));
  const moves = [
    ...rows.map((a) => ({ id: a.id as string | null, type: a.type_key, date: a.local_date, km: Number(a.distance_m ?? 0) / 1000, lat: num(a.lat), lon: num(a.lon) })),
    ...history.filter((h) => h.date && h.typeKey && !(h.id != null && synced.has(h.id))).map((h) => ({ id: null, type: h.typeKey!, date: h.date, km: Number(h.km ?? 0), lat: h.lat, lon: h.lon })),
  ].filter((m) => m.km > 0);
  // Stamps link to stored activities only; history runs have none.
  const toMove = (m: (typeof moves)[number]): Move => ({ id: m.id ?? "", date: m.date, km: m.km, country: countryOf(m.lat, m.lon) });
  return { runs: moves.filter((m) => isRun(m.type)).map(toMove), rides: moves.filter((m) => isRide(m.type)).map(toMove) };
}

/**
 * Every stamp the data supports, one row per (kind, key). A stamp keeps its earliest date: older history moves it
 * earlier, but data that goes away (a disconnect, a deleted run) never moves it later.
 */
export async function refreshStamps(userId: string, today: ISODate): Promise<void> {
  const [acct, rows, existing] = await Promise.all([
    db().from("garmin_accounts").select("personal_records, activity_history").eq("user_id", userId).maybeSingle(),
    allPages((from, to) => db().from("planned_workouts").select("id, date, type, status, activity_id, sport").eq("user_id", userId).lt("date", today).order("date").order("id").range(from, to)),
    allPages((from, to) => db().from("stamps").select("kind, key, earned_on").eq("user_id", userId).order("id").range(from, to)),
  ]);
  if (acct.error) throw acct.error;
  const { runs, rides } = await movesOf(userId, (acct.data?.activity_history ?? []) as HistoryItem[]);

  // Finished weeks only (the current one could still be completed).
  const thisWeek = weekStartOn(today, 1);
  const weeks = new Map<ISODate, { planned: number; done: number }>();
  for (const w of rows) {
    if (w.status === "removed" || w.status === "planned") continue;
    const start = weekStartOn(w.date, 1);
    if (start >= thisWeek) continue;
    const x = weeks.get(start) ?? { planned: 0, done: 0 };
    x.planned++;
    if (w.status === "done") x.done++;
    weeks.set(start, x);
  }

  const done = (type: string) => rows.filter((w) => w.type === type && w.status === "done" && w.activity_id);
  const raceRows = done("race");
  const { data: raceActs } = raceRows.length
    ? await db().from("activities").select("id, moving_s, duration_s").in("id", raceRows.map((r) => r.activity_id!))
    : { data: [] };
  const timeOf = new Map((raceActs ?? []).map((a) => [a.id, Number(a.moving_s ?? a.duration_s ?? 0)]));

  const records = ((acct.data?.personal_records ?? []) as { typeId: number; value: number; date: string | null }[]).filter((r) => r && typeof r.typeId === "number");
  const stamps = earnedStamps({
    runs,
    rides,
    records,
    weeks: [...weeks].map(([start, w]) => ({ start, ...w })),
    tests: done("test").map((w) => ({ date: w.date, activityId: w.activity_id! })),
    races: raceRows.map((w) => ({ date: w.date, activityId: w.activity_id!, timeS: timeOf.get(w.activity_id!) ?? 0 })),
  });
  // Strength (spec 2026-11-10 §9): session counts and round numbers on favourite lifts.
  const [{ custom, favourites }, logged] = await Promise.all([userExercises(userId), loggedSessions(userId)]);
  for (const st of strengthStamps(stampSessions(logged, custom), favourites)) {
    const name = st.kind === "strength_pr" ? exerciseByKey(String(st.value?.exercise), custom)?.name : undefined;
    stamps.push({ kind: st.kind, key: st.key, earnedOn: st.earnedOn, activityId: "", value: name ? { ...st.value, name } : st.value });
  }
  const before = new Map(existing.map((x) => [`${x.kind}:${x.key}`, x.earned_on]));
  // Only new stamps and ones that moved earlier are written.
  const changed = stamps.filter((s) => {
    const was = before.get(`${s.kind}:${s.key}`);
    return !was || s.earnedOn < was;
  });
  if (!changed.length) return;
  const { error } = await db()
    .from("stamps")
    .upsert(
      changed.map((s) => ({ user_id: userId, kind: s.kind, key: s.key, earned_on: s.earnedOn, activity_id: s.activityId || null, value: (s.value ?? null) as Json })),
      { onConflict: "user_id,kind,key" },
    );
  if (error) throw error;
}

const fmt = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

/** What a stamp says on the stamp itself (short) and under it (label). */
export function stampText(s: Pick<Stamp, "kind" | "key" | "value">): { mark: string; label: string } {
  const v = (s.value ?? {}) as Record<string, number>;
  switch (s.kind as StampKind) {
    case "country":
      return { mark: s.key, label: countryName(s.key) };
    case "distance":
      return { mark: s.key, label: `${s.key} km run` };
    case "volume":
      return { mark: s.key, label: `${s.key} km month` };
    case "streak":
      return { mark: `${s.key} wk`, label: `${s.key} weeks on plan` };
    case "pr":
      return { mark: PR_TYPES[v.typeId] ?? "PR", label: `Best ${PR_TYPES[v.typeId] ?? ""} ${fmt(v.seconds ?? 0)}`.replace("  ", " ") };
    case "test":
      return { mark: "Test", label: "Fitness test" };
    case "race":
      return { mark: "Race", label: v.seconds ? `Race ${fmt(v.seconds)}` : "Race" };
    case "strength_count":
      return { mark: s.key, label: s.key === "1" ? "First strength session" : `${s.key} strength sessions` };
    case "strength_pr": {
      const name = (s.value as { name?: string } | null)?.name ?? "Lift";
      return { mark: `${v.kg}`, label: `${name} ${v.kg} kg` };
    }
  }
}
