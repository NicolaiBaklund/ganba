import "server-only";
import {
  addDays,
  alertFor,
  HARD_TYPES,
  localHour,
  NOTE_PROMPT,
  noteMessage,
  NoteSchema,
  pacesFor,
  templateNote,
  type HealthAlertKind,
  type ISODate,
  type NoteFacts,
  type WorkoutType,
} from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";
import { anthropicRecoveryAi, type RecoveryAi } from "@/lib/ai/recovery";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { loadRecoveryDays } from "@/lib/recovery/load";
import { gate } from "./ai";
import { activePlan, planWorkoutsWithKm, savePlanChanges, type WorkoutRow } from "@/lib/training/service";
import { loadClock } from "./view";

const db = () => createAdminSupabase();
const QUALITY: ReadonlySet<string> = new Set(["intervals", "threshold", "tempo"]);
/** Hard sessions a "Swap to easy" may replace: never a race or a fitness test. */
const SWAPPABLE: ReadonlySet<string> = new Set([...HARD_TYPES].filter((t) => t !== "race" && t !== "test"));
const HISTORY_DAYS = 120;

export interface DailyNote {
  text: string;
  alert: HealthAlertKind | null;
  alertDone: boolean;
  /** A hard session the alert can swap for an easy run (today, or tomorrow for sleep). */
  swap: { title: string; km: number } | null;
}

type Lap = { intensityType?: string | null; distance?: number | null; duration?: number | null; movingDuration?: number | null };
type Act = { id: string; local_date: string; distance_m: number | null; moving_s: number | null; duration_s: number | null; avg_hr: number | null; splits: Json | null };

const paceOf = (a: Pick<Act, "distance_m" | "moving_s" | "duration_s">) => {
  const km = Number(a.distance_m ?? 0) / 1000;
  const s = Number(a.moving_s ?? a.duration_s ?? 0);
  return km > 0 && s > 0 ? s / km : null;
};

/** Mean pace of the fast laps (Garmin marks them ACTIVE or INTERVAL in a structured workout). */
function repsPace(splits: Json | null): number | null {
  const laps = ((splits as { lapDTOs?: Lap[] } | null)?.lapDTOs ?? []).filter((l) => (l.intensityType === "ACTIVE" || l.intensityType === "INTERVAL") && Number(l.distance) > 0);
  if (!laps.length) return null;
  const m = laps.reduce((s, l) => s + Number(l.distance), 0);
  const t = laps.reduce((s, l) => s + Number(l.movingDuration ?? l.duration ?? 0), 0);
  return m > 0 ? t / (m / 1000) : null;
}

async function factsFor(userId: string, today: ISODate) {
  const plan = await activePlan(userId);
  const workouts = plan ? await planWorkoutsWithKm(plan) : [];
  const from = addDays(today, -HISTORY_DAYS);
  const { data: rows } = plan
    ? await db().from("planned_workouts").select("date, type, title, status, activity_id").eq("plan_id", plan.id).gte("date", from).lte("date", today)
    : { data: [] as Pick<WorkoutRow, "date" | "type" | "title" | "status" | "activity_id">[] };
  const doneRows = (rows ?? []).filter((w) => w.status === "done" && w.activity_id);
  const { data: acts } = doneRows.length
    ? await db().from("activities").select("id, local_date, distance_m, moving_s, duration_s, avg_hr, splits").in("id", doneRows.map((w) => w.activity_id!))
    : { data: [] as Act[] };
  const actOf = new Map((acts ?? []).map((a) => [a.id, a as Act]));

  const paces = plan && plan.sport !== "ride" ? pacesFor(Number(plan.vdot)) : null;
  const easyRuns = doneRows.filter((w) => w.type === "easy").flatMap((w) => {
    const p = paceOf(actOf.get(w.activity_id!) ?? ({} as Act));
    return p ? [{ date: w.date, secPerKm: p }] : [];
  });
  const days = await loadRecoveryDays(userId, today, 40);
  const alert = alertFor({ days, today, easyRuns, easyFastSecPerKm: paces?.easy.min ?? null });

  const yRow = doneRows.find((w) => w.date === addDays(today, -1));
  const yAct = yRow ? actOf.get(yRow.activity_id!) : undefined;
  let yesterday: NoteFacts["yesterday"] = null;
  if (yRow && yAct) {
    const reps = QUALITY.has(yRow.type) ? repsPace(yAct.splits) : null;
    const earlier = doneRows.filter((w) => w.type === yRow.type && w.date < yRow.date).map((w) => repsPace(actOf.get(w.activity_id!)?.splits ?? null)).filter((p): p is number => p != null);
    yesterday = {
      type: yRow.type,
      title: yRow.title,
      km: Math.round(Number(yAct.distance_m ?? 0) / 100) / 10,
      avgSecPerKm: paceOf(yAct) && Math.round(paceOf(yAct)!),
      avgHr: yAct.avg_hr,
      repsAvgSecPerKm: reps && Math.round(reps),
      bestYet: reps != null && earlier.length > 0 && reps < Math.min(...earlier),
    };
  }
  // Rides count as the day's session too (a ride plan, or a ride day in a running plan).
  const planned = (d: ISODate) => workouts.find((w) => w.date === d && w.status === "planned");
  const t = planned(today);
  const tomorrow = planned(addDays(today, 1));
  const clock = await loadClock(userId, today).catch(() => null);
  const facts: NoteFacts = {
    alert,
    yesterday,
    today: t ? { type: t.type, title: t.title, km: t.plannedKm, hrMax: null } : null,
    tomorrow: tomorrow && HARD_TYPES.has(tomorrow.type as WorkoutType) ? { title: tomorrow.title } : null,
    clockDeltaS: clock?.deltaS ?? null,
    raceName: clock?.race.name ?? null,
  };
  return { facts, plan, workouts, paces };
}

/** The hard session an alert can swap: today's, or tomorrow's for the sleep alert. */
function swapTarget(alert: HealthAlertKind | null, workouts: Awaited<ReturnType<typeof factsFor>>["workouts"], today: ISODate) {
  if (alert !== "sick" && alert !== "sleep") return null;
  const days = alert === "sick" ? [today, addDays(today, 1)] : [addDays(today, 1)];
  return workouts.find((w) => days.includes(w.date) && w.status === "planned" && w.sport === "run" && SWAPPABLE.has(w.type)) ?? null;
}

/** Same time as the session, at easy pace, to the nearest half km. */
const easyKm = (durationS: number, easyMaxSecPerKm: number, easyMinSecPerKm: number) => Math.max(3, Math.round((durationS / ((easyMaxSecPerKm + easyMinSecPerKm) / 2)) * 2) / 2);

/** Without a night (watch off in bed), a sync after this hour still counts as "the morning's data is in". */
export const NOTE_WAIT_HOUR = 10;

/** Last night is in: today's night row, or a sync today late enough that no night is coming. */
async function morningIsIn(userId: string, today: ISODate): Promise<boolean> {
  const [{ data: night }, { data: acct }, { data: profile }] = await Promise.all([
    db().from("recovery_days").select("id").eq("user_id", userId).eq("local_date", today).maybeSingle(),
    db().from("garmin_accounts").select("last_synced_date, last_synced_at").eq("user_id", userId).maybeSingle(),
    db().from("profiles").select("timezone").eq("user_id", userId).single(),
  ]);
  if (night) return true;
  return acct?.last_synced_date === today && !!acct.last_synced_at && localHour(profile?.timezone ?? "UTC", new Date(acct.last_synced_at)) >= NOTE_WAIT_HOUR;
}

/**
 * Today's note (spec §7): written once, stored and reused. With Garmin it waits for the morning's data (a note
 * written before the sync would miss the alert); until then a template without the alert is shown and nothing is
 * stored. No plan and nothing to warn about: no note at all.
 */
export async function dailyNote(userId: string, today: ISODate, opts: { ai?: RecoveryAi } = {}): Promise<DailyNote | null> {
  const { data: row } = await db().from("daily_notes").select("text, alert, alert_done").eq("user_id", userId).eq("local_date", today).maybeSingle();
  const built = await factsFor(userId, today);
  const target = swapTarget((row?.alert ?? built.facts.alert?.kind ?? null) as HealthAlertKind | null, built.workouts, today);
  const swap = target && built.paces ? { title: target.title, km: easyKm(target.plannedDurationS, built.paces.easy.max, built.paces.easy.min) } : null;
  if (row) return { text: row.text, alert: row.alert as HealthAlertKind | null, alertDone: row.alert_done, swap: row.alert_done ? null : swap };

  const { facts } = built;
  const garmin = await getGarminStatus(userId);
  if (garmin && !(await morningIsIn(userId, today))) {
    if (!built.plan) return null;
    return { text: templateNote({ ...facts, alert: null }), alert: null, alertDone: false, swap: null };
  }
  if (!built.plan && !facts.alert) return null;
  const text = templateNote(facts);

  let out = { text, source: "template" as "ai" | "template" };
  const g = await gate(userId);
  if (g.ok) {
    const res = await (opts.ai ?? anthropicRecoveryAi).ask(g.apiKey, NOTE_PROMPT, noteMessage(facts, g.language), NoteSchema);
    if (res.ok) out = { text: res.value.text.trim(), source: "ai" };
  }
  await db()
    .from("daily_notes")
    .upsert({ user_id: userId, local_date: today, text: out.text, alert: facts.alert?.kind ?? null, facts: facts as unknown as Json, source: out.source }, { onConflict: "user_id,local_date", ignoreDuplicates: true });
  return { text: out.text, alert: facts.alert?.kind ?? null, alertDone: false, swap };
}

/** "Swap to easy N km": the alert's hard session becomes an easy run of the same time. Once per alert. */
export async function swapToEasy(userId: string, today: ISODate): Promise<boolean> {
  const { data: row } = await db().from("daily_notes").select("alert, alert_done").eq("user_id", userId).eq("local_date", today).maybeSingle();
  if (!row || row.alert_done) return false;
  const { plan, workouts, paces } = await factsFor(userId, today);
  const target = swapTarget(row.alert as HealthAlertKind | null, workouts, today);
  if (!plan || !paces || !target) return false;
  // Claim the alert first so two taps never swap twice.
  const { data: claimed } = await db().from("daily_notes").update({ alert_done: true }).eq("user_id", userId).eq("local_date", today).eq("alert_done", false).select("id");
  if (!claimed?.length) return false;
  await savePlanChanges(userId, plan, [{ op: "replace", workoutId: target.id, type: "easy", km: easyKm(target.plannedDurationS, paces.easy.max, paces.easy.min) }], today);
  return true;
}

/** "Keep the plan": the alert is dealt with and its buttons go. */
export async function keepPlan(userId: string, today: ISODate): Promise<void> {
  await db().from("daily_notes").update({ alert_done: true }).eq("user_id", userId).eq("local_date", today);
}
