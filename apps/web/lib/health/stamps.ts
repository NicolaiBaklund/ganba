import "server-only";
import { earnedStamps, isRun, PR_TYPES, weekStartOn, type ISODate, type Stamp, type StampKind } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";
import { countryName, countryOf } from "./country";

const db = () => createAdminSupabase();
const num = (v: unknown) => (v == null ? null : Number(v));

/** Runs as stamps see them: km and the country they started in. */
async function runsOf(userId: string) {
  const { data, error } = await db()
    .from("activities")
    .select("id, local_date, type_key, distance_m, lat:raw->startLatitude, lon:raw->startLongitude")
    .eq("user_id", userId)
    .order("local_date");
  if (error) throw error;
  return (data ?? [])
    .filter((a) => isRun(a.type_key) && Number(a.distance_m) > 0)
    .map((a) => ({ id: a.id, date: a.local_date, km: Number(a.distance_m) / 1000, country: countryOf(num(a.lat), num(a.lon)) }));
}

/** Every stamp the data supports, stored once: a later sync never adds the same (kind, key) again. */
export async function refreshStamps(userId: string, today: ISODate): Promise<void> {
  const [runs, acct, workouts] = await Promise.all([
    runsOf(userId),
    db().from("garmin_accounts").select("personal_records").eq("user_id", userId).maybeSingle(),
    db().from("planned_workouts").select("date, type, status, activity_id, sport").eq("user_id", userId).lt("date", today),
  ]);
  if (workouts.error) throw workouts.error;
  const rows = workouts.data ?? [];

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
    records,
    weeks: [...weeks].map(([start, w]) => ({ start, ...w })),
    tests: done("test").map((w) => ({ date: w.date, activityId: w.activity_id! })),
    races: raceRows.map((w) => ({ date: w.date, activityId: w.activity_id!, timeS: timeOf.get(w.activity_id!) ?? 0 })),
  });
  if (!stamps.length) return;
  const { error } = await db()
    .from("stamps")
    .upsert(
      stamps.map((s) => ({ user_id: userId, kind: s.kind, key: s.key, earned_on: s.earnedOn, activity_id: s.activityId ?? null, value: (s.value ?? null) as Json })),
      { onConflict: "user_id,kind,key", ignoreDuplicates: true },
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
  }
}
