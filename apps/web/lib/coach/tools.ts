import "server-only";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { addDays, daysBetween, describeBlocks, fmtRideDuration, formatPace, isRide, trendSeries, weekday, type ISODate } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getDaySnapshot } from "@/lib/db/today";
import { knownParts } from "@/lib/recovery/view";
import { loadFindings, type FindingRow } from "@/lib/recovery/findings";
import { findingParams } from "@/lib/recovery/text";
import { planWorkouts, toPlanWorkout } from "@/lib/training/service";
import type { CoachContext } from "./context";

/**
 * The coach's read tools (spec 2026-10-26 §5): it fetches what it needs instead of getting everything in the
 * context. Results are compact text. Health tools exist only with AI health-data consent; ranges are capped.
 */
export const MAX_RANGE_DAYS = 31;
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const Range = z.object({ from: isoDate, to: isoDate });
const SessionInput = z.object({ ref: z.string().optional().describe("Session ref from the plan, e.g. s3"), date: isoDate.optional() });
const Empty = z.object({});
const schema = (s: z.ZodType) => z.toJSONSchema(s) as Anthropic.Tool["input_schema"];
const r0 = (n: number | null | undefined) => (n == null ? "–" : String(Math.round(Number(n))));
const r1 = (n: number) => Math.round(n * 10) / 10;
const db = () => createAdminSupabase();

/** Status lines the chat shows while a tool runs (English UI). */
export const TOOL_LABELS: Record<string, string> = {
  food_log: "Looking at your food log…",
  session: "Checking the session…",
  activities: "Looking at your activities…",
  recovery: "Looking at your sleep and recovery…",
  findings: "Checking what your data shows…",
  weight: "Looking at your weight…",
  plan: "Reading your plan…",
  check_plan_changes: "Trying the plan change…",
  update_notes: "Updating my notes…",
};

const HEALTH = new Set(["recovery", "findings"]);
const DEFS: { name: string; description: string; input: z.ZodType; needsPlan?: boolean }[] = [
  { name: "food_log", description: "Meals (time, dishes, kcal, protein/carbs/fat) per day in a date range, with day totals and today's targets.", input: Range },
  { name: "session", description: "A planned session (by ref, or by date) with its steps and targets, and the activity it was matched to: laps (time, km, pace or power, heart rate) and totals. Without a plan, the activities of that date.", input: SessionInput },
  { name: "activities", description: "All activities (every sport) in a date range: type, duration, distance, heart rate, kcal, training effect.", input: Range },
  { name: "recovery", description: "Per night/day in a range: sleep (duration, need, score, bed and wake time), HRV vs baseline, resting HR, Form score and its parts.", input: Range },
  { name: "findings", description: "Links found in this person's own data (e.g. short sleep → lower HRV next day): strength and how many days they rest on, and what still needs more data.", input: Empty },
  { name: "weight", description: "Weight and trend weight per day in a range, with the goal (target, rate) and the current trend.", input: Range },
  { name: "plan", description: "Planned sessions in a date range with steps and status.", input: Range, needsPlan: true },
];

/** The read tools for this conversation: health ones only with consent, the plan one only with a plan. */
export function readTools(cc: CoachContext): Anthropic.Tool[] {
  return DEFS.filter((d) => (!HEALTH.has(d.name) || cc.consent) && (!d.needsPlan || cc.plan)).map((d) => ({ name: d.name, description: d.description, input_schema: schema(d.input) }));
}
export const isReadTool = (name: string) => DEFS.some((d) => d.name === name);

/** A range clamped to at most 31 days (ending at `to`), with a note when it was cut. */
function clampRange(from: ISODate, to: ISODate): { from: ISODate; to: ISODate; note: string } {
  const [a, b] = from <= to ? [from, to] : [to, from];
  if (daysBetween(a, b) + 1 <= MAX_RANGE_DAYS) return { from: a, to: b, note: "" };
  const start = addDays(b, -(MAX_RANGE_DAYS - 1));
  return { from: start, to: b, note: `(Range capped to 31 days: ${start}–${b}.)\n` };
}

async function timezone(userId: string): Promise<string> {
  const { data } = await db().from("profiles").select("timezone").eq("user_id", userId).single();
  return data?.timezone ?? "UTC";
}
const clock = (iso: string | null, tz: string) =>
  iso ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso)) : "–";

async function foodLog(cc: CoachContext, from: ISODate, to: ISODate): Promise<string> {
  const tz = await timezone(cc.userId);
  const { data: entries } = await db()
    .from("food_entries")
    .select("id, local_date, logged_at, meal_type, food_items(name, kcal, protein_g, carbs_g, fat_g)")
    .eq("user_id", cc.userId)
    .gte("local_date", from)
    .lte("local_date", to)
    .order("logged_at");
  const snap = await getDaySnapshot(db(), cc.userId, cc.today);
  const t = snap.macrosTarget;
  const out = [`Targets (today): ${r0(snap.target.kcal)} kcal, protein ${r0(t.proteinG)} g, carbs ${r0(t.carbsG)} g, fat ${r0(t.fatG)} g.`];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = (entries ?? []).filter((e) => e.local_date === d);
    if (!day.length) {
      out.push(`${d} ${DAY[weekday(d)]}: nothing logged`);
      continue;
    }
    const sum = { kcal: 0, p: 0, c: 0, f: 0 };
    const meals = day.map((e) => {
      const items = (e.food_items ?? []) as { name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }[];
      for (const i of items) {
        sum.kcal += Number(i.kcal);
        sum.p += Number(i.protein_g);
        sum.c += Number(i.carbs_g);
        sum.f += Number(i.fat_g);
      }
      return `  ${clock(e.logged_at, tz)} ${e.meal_type}: ${items.map((i) => `${i.name} (${r0(i.kcal)} kcal, P${r0(i.protein_g)} C${r0(i.carbs_g)} F${r0(i.fat_g)})`).join(", ")}`;
    });
    out.push(`${d} ${DAY[weekday(d)]}: ${r0(sum.kcal)} kcal, protein ${r0(sum.p)} g, carbs ${r0(sum.c)} g, fat ${r0(sum.f)} g`, ...meals);
  }
  return out.join("\n");
}

type Lap = { distance?: number | null; duration?: number | null; movingDuration?: number | null; averageSpeed?: number | null; averageHR?: number | null; averagePower?: number | null };
function activityLines(a: { type_key: string; name: string | null; distance_m: number | null; duration_s: number | null; moving_s: number | null; avg_hr: number | null; max_hr: number | null; garmin_kcal: number | null; splits: unknown }) {
  const ride = isRide(a.type_key);
  const km = Number(a.distance_m ?? 0) / 1000;
  const s = Number(a.moving_s ?? a.duration_s ?? 0);
  const head = `${a.type_key}${a.name ? ` "${a.name}"` : ""}: ${km ? `${r1(km)} km, ` : ""}${fmtRideDuration(s / 60)}${km && !ride ? ` at ${formatPace(s / km)}/km` : ""}, HR avg ${r0(a.avg_hr)} max ${r0(a.max_hr)}, ${r0(a.garmin_kcal)} kcal`;
  const laps = ((a.splits as { lapDTOs?: Lap[] } | null)?.lapDTOs ?? []).map((l, i) => {
    const lt = Number(l.movingDuration ?? l.duration ?? 0);
    const lkm = Number(l.distance ?? 0) / 1000;
    const pace = !ride && lkm > 0 ? `${formatPace(lt / lkm)}/km` : l.averageSpeed ? `${r1(l.averageSpeed * 3.6)} km/h` : "";
    return `  lap ${i + 1}: ${r1(lkm)} km in ${fmtRideDuration(lt / 60)}${pace ? `, ${pace}` : ""}, HR ${r0(l.averageHR)}${l.averagePower ? `, ${r0(l.averagePower)} W` : ""}`;
  });
  return [head, ...laps];
}

async function session(cc: CoachContext, input: z.infer<typeof SessionInput>): Promise<string> {
  const id = input.ref ? cc.refs.get(input.ref) : undefined;
  const rows = cc.plan ? await planWorkouts(cc.plan.id) : [];
  const planned = id ? rows.filter((w) => w.id === id) : input.date ? rows.filter((w) => w.date === input.date && w.status !== "removed") : [];
  if (input.ref && !id) return `Unknown session ${input.ref}.`;
  const date = planned[0]?.date ?? input.date;
  if (!date) return "Give a session ref or a date.";
  const linked = new Set(planned.map((w) => w.activity_id).filter(Boolean));
  const { data: acts } = await db()
    .from("activities")
    .select("id, type_key, name, distance_m, duration_s, moving_s, avg_hr, max_hr, garmin_kcal, splits")
    .eq("user_id", cc.userId)
    .eq("local_date", date)
    .order("start_time");
  const out = [`${date} ${DAY[weekday(date)]}`];
  for (const w of planned) {
    const pw = toPlanWorkout(w);
    out.push(`Planned (${pw.status}): ${pw.sport} ${pw.type} "${pw.title}" — ${describeBlocks(pw.blocks)}`);
  }
  if (!planned.length) out.push("No planned session that day.");
  const shown = (acts ?? []).sort((a, b) => Number(linked.has(b.id)) - Number(linked.has(a.id)));
  if (!shown.length) out.push("No activity recorded that day.");
  for (const a of shown) out.push(`${linked.has(a.id) ? "Matched activity" : "Activity"}: ${activityLines(a).join("\n")}`);
  return out.join("\n");
}

async function activities(cc: CoachContext, from: ISODate, to: ISODate): Promise<string> {
  const { data } = await db()
    .from("activities")
    .select("local_date, type_key, name, distance_m, duration_s, moving_s, avg_hr, max_hr, garmin_kcal, te_aerobic, te_anaerobic")
    .eq("user_id", cc.userId)
    .gte("local_date", from)
    .lte("local_date", to)
    .order("start_time");
  if (!data?.length) return "No activities in that range.";
  return data
    .map((a) => `${a.local_date} ${DAY[weekday(a.local_date)]} ${activityLines({ ...a, splits: null })[0]}${a.te_aerobic != null ? `, TE ${r1(Number(a.te_aerobic))}/${r1(Number(a.te_anaerobic ?? 0))}` : ""}`)
    .join("\n");
}

async function recovery(cc: CoachContext, from: ISODate, to: ISODate): Promise<string> {
  const tz = await timezone(cc.userId);
  const [{ data: nights }, { data: form }] = await Promise.all([
    db().from("recovery_days").select("local_date, sleep_s, sleep_need_s, sleep_score, sleep_start, sleep_end, hrv_avg, hrv_baseline_low, hrv_baseline_high, resting_hr").eq("user_id", cc.userId).gte("local_date", from).lte("local_date", to).order("local_date"),
    db().from("form_days").select("local_date, score, parts").eq("user_id", cc.userId).gte("local_date", from).lte("local_date", to),
  ]);
  const formOf = new Map((form ?? []).map((f) => [f.local_date, f]));
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const n = (nights ?? []).find((x) => x.local_date === d);
    const f = formOf.get(d);
    const h = (s: number | null) => (s == null ? "–" : `${r1(s / 3600)} h`);
    const sleep = n
      ? `sleep ${h(n.sleep_s)} (need ${h(n.sleep_need_s)}, score ${r0(n.sleep_score)}, ${clock(n.sleep_start, tz)}–${clock(n.sleep_end, tz)}), HRV ${r0(n.hrv_avg)} (baseline ${r0(n.hrv_baseline_low)}–${r0(n.hrv_baseline_high)}), resting HR ${r0(n.resting_hr)}`
      : "no sleep data";
    const parts = f ? knownParts(f.parts).filter((p) => p.status === "ok").map((p) => `${p.id} ${p.points > 0 ? "+" : ""}${p.points}`).join(", ") : "";
    out.push(`${d} ${DAY[weekday(d)]}: ${sleep}${f?.score != null ? `; Form ${f.score} (${parts})` : ""}`);
  }
  return out.join("\n");
}

async function findings(cc: CoachContext): Promise<string> {
  const f = await loadFindings(cc.userId, cc.consent);
  const line = (x: FindingRow) => {
    const p = findingParams(x);
    const lag = x.lag ? ` (${x.lag} day later)` : "";
    // Tertile factors have bounds (high group ≥, low group ≤); yes/no factors have none.
    const groups = p.high && p.low ? `${x.factor} ≥ ${p.high} vs ≤ ${p.low}` : `${x.factor} yes vs no`;
    return `- ${groups} → ${x.outcome}${lag}: ${p.diff} (${p.better ? "better" : "worse"}), over ${p.nHigh} + ${p.nLow} days`;
  };
  return [
    f.findings.length ? "Found in their own data (strongest first):" : "Nothing verified in their data yet (it usually takes a couple of months of steady logging).",
    ...f.findings.map(line),
    ...(f.noEffect.length ? ["Checked, no clear link:", ...f.noEffect.map((x) => `- ${x.factor} → ${x.outcome}`)] : []),
    ...(f.needsData.length ? ["Needs more data:", ...f.needsData.slice(0, 6).map((x) => `- ${x.factor} → ${x.outcome}: ${findingParams(x).have} of ${x.needed} days`)] : []),
  ].join("\n");
}

async function weight(cc: CoachContext, from: ISODate, to: ISODate): Promise<string> {
  const [{ data: rows }, snap] = await Promise.all([
    db().from("weight_entries").select("local_date, measured_at, weight_kg").eq("user_id", cc.userId).lte("local_date", to).order("local_date"),
    getDaySnapshot(db(), cc.userId, cc.today),
  ]);
  const series = trendSeries((rows ?? []).map((w) => ({ localDate: w.local_date, measuredAt: w.measured_at, weightKg: Number(w.weight_kg) })));
  const days = series.filter((p) => p.date >= from && p.date <= to);
  return [
    `Goal: ${snap.goal.targetWeightKg} kg at ${snap.goal.rateKgPerWeek} kg/week. Trend now ${snap.latestTrendKg ?? "–"} kg, ${snap.weeklyChangeKg != null ? `${r1(snap.weeklyChangeKg)} kg/week` : "rate unknown"}.`,
    ...(days.length ? days.map((p) => `${p.date}: ${r1(p.weightKg)} kg (trend ${r1(p.trendKg)})`) : ["No weigh-ins in that range."]),
  ].join("\n");
}

async function plan(cc: CoachContext, from: ISODate, to: ISODate): Promise<string> {
  const rows = (await planWorkouts(cc.plan!.id)).filter((w) => w.date >= from && w.date <= to && w.status !== "removed");
  if (!rows.length) return "No sessions in that range.";
  return rows
    .map((w) => {
      const pw = toPlanWorkout(w);
      const ref = cc.refOf.get(w.id);
      return `${ref ? `${ref} | ` : ""}${pw.date} ${DAY[weekday(pw.date)]} | ${pw.sport} ${pw.type} "${pw.title}" | ${pw.status} | ${describeBlocks(pw.blocks)}`;
    })
    .join("\n");
}

/** Runs a read tool. Never throws: bad input, a missing plan or consent come back as text the coach can read. */
export async function runReadTool(cc: CoachContext, name: string, input: unknown): Promise<string> {
  const def = DEFS.find((d) => d.name === name);
  if (!def) return `Unknown tool ${name}.`;
  if (HEALTH.has(name) && !cc.consent) return "Not available: health data is off for AI (the person can switch it on in Profile).";
  if (def.needsPlan && !cc.plan) return "There is no training plan.";
  const p = def.input.safeParse(input ?? {});
  if (!p.success) return `Invalid input: ${p.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`;
  try {
    if (name === "session") return await session(cc, p.data as z.infer<typeof SessionInput>);
    if (name === "findings") return await findings(cc);
    const r = p.data as z.infer<typeof Range>;
    const { from, to, note } = clampRange(r.from, r.to);
    const body =
      name === "food_log"
        ? await foodLog(cc, from, to)
        : name === "activities"
          ? await activities(cc, from, to)
          : name === "recovery"
            ? await recovery(cc, from, to)
            : name === "weight"
              ? await weight(cc, from, to)
              : await plan(cc, from, to);
    return note + body;
  } catch (e) {
    return `Could not read ${name}: ${e instanceof Error ? e.message : "error"}`;
  }
}
