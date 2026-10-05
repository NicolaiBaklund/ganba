import { addDays, type ISODate } from "../dates";
import { mean, median } from "./stats";
import type { RecoveryDayInput } from "./types";
import type { RecoveryFactor } from "./variables";

/**
 * Form: one 0–100 number per morning (spec docs/specs/2026-10-05-form.md §3).
 * 50 + points from each part against the person's own normal; parts without data count 0.
 */
export const FORM_PART_IDS = ["hrv", "sleep", "rhr", "sleepDebt", "load", "energy", "carbs", "lastHard"] as const;
export type FormPartId = (typeof FORM_PART_IDS)[number];
export type FormBand = "ready" | "steady" | "low";
export const FORM_BANDS = { ready: 70, steady: 40 } as const;

export interface FormPart {
  id: FormPartId;
  /** Signed points added to 50, one decimal. */
  points: number;
  status: "ok" | "missing";
  /** Strengthened or added by a verified finding in the person's own data. */
  learned: boolean;
  /** The numbers behind the points, for the "What counts" sheet. */
  values: Record<string, number | null>;
}

export interface FormResult {
  date: ISODate;
  score: number;
  band: FormBand;
  parts: FormPart[];
}

/** A verified run-form finding from the engine (outcome runForm, kind finding). */
export interface FormFinding {
  factor: RecoveryFactor;
  lag: number;
  effectSd: number;
  highBound: number | null;
  lowBound: number | null;
}

export interface FormContext {
  findings: readonly FormFinding[];
  /** A hard session (intervals, threshold, tempo, race, long) is planned on this date. */
  hardPlanned: boolean;
}

export const FORM_RULES = {
  hrvMax: 18,
  sleepMax: 10,
  rhrMax: 8,
  debtMinus: 8,
  debtPlus: 2,
  debtFreeH: 3.5,
  debtFullH: 14,
  loadMinus: 8,
  loadPlus: 3,
  energyMinus: 10,
  energyPlus: 2,
  carbsMinus: 5,
  carbsPlus: 2,
  learnedMax: 8,
  learnedBoost: 1.5,
  normalDays: 28,
  minNormal: 14,
  minDebtNights: 4,
  minLoadDays: 21,
  /** Last hard session: full minus the day after a usual-sized one, half the day after that. */
  lastHardMinus: 6,
  lastHardDay2: 0.5,
  /** A session's size vs the person's usual hard session counts from half to full; unknown size counts in between. */
  lastHardMinRatio: 0.5,
  lastHardUnknownRatio: 0.75,
  /** "Usual" = median of hard days in the 28 days before the two being sized (fits the 120 loaded days). */
  typicalHardDays: 28,
  minTypicalHard: 3,
} as const;

const R = FORM_RULES;
const clamp = (x: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, x));
const round1 = (x: number) => Math.round(x * 10) / 10;

export const formBand = (score: number): FormBand => (score >= FORM_BANDS.ready ? "ready" : score >= FORM_BANDS.steady ? "steady" : "low");

type Index = ReadonlyMap<ISODate, RecoveryDayInput>;
const indexOf = (days: readonly RecoveryDayInput[]): Index => new Map(days.map((d) => [d.date, d]));

/** Values of the previous `n` days (not the day itself). */
function previous(ix: Index, date: ISODate, n: number, pick: (d: RecoveryDayInput) => number | null | undefined): number[] {
  const out: number[] = [];
  for (let i = 1; i <= n; i++) {
    const v = pick(ix.get(addDays(date, -i)) ?? ({} as RecoveryDayInput));
    if (v != null) out.push(v);
  }
  return out;
}

function mad(xs: readonly number[]): number {
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

const ok = (id: FormPartId, points: number, values: FormPart["values"]): FormPart => ({ id, points, status: "ok", learned: false, values });
const missing = (id: FormPartId, values: FormPart["values"] = {}): FormPart => ({ id, points: 0, status: "missing", learned: false, values });

/** Acute (last 7 days) vs chronic (weekly average of the last 28) training load, both ending the day before. */
export function loadRatio(ix: Index, date: ISODate): number | null {
  let known = 0;
  let acute = 0;
  let chronic = 0;
  for (let i = 1; i <= 28; i++) {
    const l = ix.get(addDays(date, -i))?.load;
    if (l == null) continue;
    known++;
    chronic += l;
    if (i <= 7) acute += l;
  }
  if (known < R.minLoadDays || chronic <= 0) return null;
  // Weekly average over the days with data: days without the watch must not shrink "usual" and inflate the ratio.
  return acute / ((chronic / known) * 7);
}

/** Mean deficit of the three days before `date`, when all three are logged food days. */
function deficit3Before(ix: Index, date: ISODate): number | null {
  const ds = [1, 2, 3].map((i) => ix.get(addDays(date, -i))?.food?.deficitKcal ?? null);
  return ds.every((x) => x != null) ? mean(ds as number[]) : null;
}

/** Median training load of the person's hard days D−3 and back (null with fewer than 3): the sessions being sized never set their own scale. */
function typicalHardLoad(ix: Index, date: ISODate): number | null {
  const loads = previous(ix, addDays(date, -2), R.typicalHardDays, (x) => (x.hard && x.load ? x.load : null));
  return loads.length >= R.minTypicalHard ? median(loads) : null;
}

function hrvPart(ix: Index, d: RecoveryDayInput): FormPart {
  if (d.hrv == null) return missing("hrv");
  let z: number;
  let low = d.hrvLow ?? null;
  let high = d.hrvHigh ?? null;
  if (low != null && high != null && high >= low) {
    z = (d.hrv - (low + high) / 2) / Math.max((high - low) / 2, 1);
  } else {
    const prev = previous(ix, d.date, R.normalDays, (x) => x.hrv);
    if (prev.length < R.minNormal) return missing("hrv", { hrv: d.hrv });
    const m = median(prev);
    const spread = Math.max(1.4826 * mad(prev), 1);
    z = (d.hrv - m) / spread / 1.5;
    low = Math.round(m - spread);
    high = Math.round(m + spread);
  }
  return ok("hrv", R.hrvMax * clamp(0.6 * z), { hrv: d.hrv, low, high });
}

function sleepPart(d: RecoveryDayInput): FormPart {
  const s = d.sleepScore;
  if (s == null) return missing("sleep");
  const x = s >= 70 ? (s - 70) / 20 : (s - 70) / 30;
  return ok("sleep", R.sleepMax * clamp(x), { score: s, hours: d.sleepS != null ? round1(d.sleepS / 3600) : null });
}

function rhrPart(ix: Index, d: RecoveryDayInput): FormPart {
  if (d.restingHr == null) return missing("rhr");
  const prev = previous(ix, d.date, R.normalDays, (x) => x.restingHr);
  if (prev.length < R.minNormal) return missing("rhr", { rhr: d.restingHr });
  const m = median(prev);
  const z = (d.restingHr - m) / Math.max(1.4826 * mad(prev), 1.5);
  return ok("rhr", -R.rhrMax * clamp(z / 2), { rhr: d.restingHr, normal: m });
}

function sleepDebtPart(ix: Index, date: ISODate): FormPart {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const x = ix.get(addDays(date, -i));
    if (x?.sleepS == null || x.sleepNeedS == null) continue;
    sum += x.sleepS - x.sleepNeedS;
    n++;
  }
  if (n < R.minDebtNights) return missing("sleepDebt", { nights: n });
  const hours = (sum / 3600) * (7 / n);
  // Garmin's need runs high: up to half an hour short a night is free, two hours short a night is the full minus.
  const points = hours < 0 ? -R.debtMinus * clamp((-hours - R.debtFreeH) / (R.debtFullH - R.debtFreeH), 0, 1) : R.debtPlus * Math.min(hours / 3.5, 1);
  return ok("sleepDebt", points, { hours: round1(hours), nights: n });
}

function loadPart(ix: Index, date: ISODate): FormPart {
  const r = loadRatio(ix, date);
  if (r == null) return missing("load");
  const points = r > 1.3 ? -R.loadMinus * Math.min((r - 1.3) / 0.2, 1) : r < 0.8 ? R.loadPlus * Math.min((0.8 - r) / 0.3, 1) : 0;
  return ok("load", points, { ratio: r });
}

function energyPart(ix: Index, date: ISODate): FormPart {
  const u = deficit3Before(ix, date);
  if (u == null) return missing("energy");
  const points = u > 300 ? -R.energyMinus * Math.min((u - 300) / 700, 1) : u < 0 ? R.energyPlus * Math.min(-u / 500, 1) : 0;
  return ok("energy", points, { deficit: Math.round(u) });
}

function carbsPart(ix: Index, date: ISODate): FormPart {
  const c = ix.get(addDays(date, -1))?.food?.carbsPerKg;
  if (c == null) return missing("carbs");
  const points = c < 3 ? -R.carbsMinus * Math.min((3 - c) / 1.5, 1) : c >= 5 ? R.carbsPlus : 0;
  return ok("carbs", points, { carbsPerKg: round1(c) });
}

/**
 * A hard day (any activity, planned or not) yesterday or the day before: legs carry it even when HRV bounces back.
 * Sized by its load against the person's usual hard session; two in a row add up to the cap.
 */
function lastHardPart(ix: Index, date: ISODate): FormPart {
  let typical: number | null | undefined; // worked out only when there is a hard day to size
  let points = 0;
  let last: { days: number; load: number | null } | null = null;
  for (const [back, weight] of [[1, 1], [2, R.lastHardDay2]] as const) {
    const x = ix.get(addDays(date, -back));
    if (!x?.hard) continue;
    if (typical === undefined) typical = typicalHardLoad(ix, date);
    const ratio = !x.load ? R.lastHardUnknownRatio : typical ? clamp(x.load / typical, R.lastHardMinRatio, 1) : 1;
    points -= R.lastHardMinus * weight * ratio;
    last ??= { days: back, load: x.load ?? null };
  }
  return ok("lastHard", Math.max(points, -R.lastHardMinus), { days: last?.days ?? null, load: last?.load != null ? Math.round(last.load) : null, typical: typical != null ? Math.round(typical) : null });
}

/** Parts a run-form finding can strengthen; the sign says which way the part already points for a higher factor. */
const BOOSTS: Partial<Record<RecoveryFactor, { part: FormPartId; sign: 1 | -1 }>> = {
  sleepScore: { part: "sleep", sign: 1 },
  hrv: { part: "hrv", sign: 1 },
  carbs: { part: "carbs", sign: 1 },
  deficit3: { part: "energy", sign: -1 },
  // More days since a hard day → better runs: the last-hard-session minus is real for this person.
  daysSinceHard: { part: "lastHard", sign: 1 },
};

/** Form for one morning, or null without a night (no sleep score and no HRV). */
export function computeForm(days: readonly RecoveryDayInput[] | Index, date: ISODate, ctx: FormContext): FormResult | null {
  const ix: Index = days instanceof Map ? days : indexOf(days as readonly RecoveryDayInput[]);
  const d = ix.get(date);
  if (!d || (d.sleepScore == null && d.hrv == null)) return null;

  const parts: FormPart[] = [hrvPart(ix, d), sleepPart(d), rhrPart(ix, d), sleepDebtPart(ix, date), loadPart(ix, date), energyPart(ix, date), lastHardPart(ix, date)];
  if (ctx.hardPlanned) parts.push(carbsPart(ix, date));

  // Learned: a run-form finding that agrees with a part strengthens it (×1.5).
  const extras = new Map<FormPartId, number>();
  for (const f of ctx.findings) {
    const boost = BOOSTS[f.factor];
    if (!boost) continue;
    const p = parts.find((x) => x.id === boost.part);
    // Rest finding: only when the last hard day is in the group the finding says runs worse (≤ its low cut).
    if (f.factor === "daysSinceHard" && f.lowBound != null && (p?.values.days ?? Infinity) > f.lowBound) continue;
    if (p?.status === "ok" && Math.sign(f.effectSd) === boost.sign && p.points !== 0) {
      p.learned = true;
      extras.set(p.id, (extras.get(p.id) ?? 0) + p.points * (R.learnedBoost - 1));
    }
  }
  const extraSum = [...extras.values()].reduce((s, x) => s + x, 0);
  const scale = Math.abs(extraSum) > R.learnedMax ? R.learnedMax / Math.abs(extraSum) : 1;
  for (const p of parts) p.points = round1(p.points + (extras.get(p.id) ?? 0) * scale);

  const score = Math.round(clamp(50 + parts.reduce((s, p) => s + p.points, 0), 0, 100));
  return { date, score, band: formBand(score), parts };
}

/** Form for every date in [from, to]; dates without a night are left out. */
export function formSeries(days: readonly RecoveryDayInput[], from: ISODate, to: ISODate, ctx: (date: ISODate) => FormContext): Map<ISODate, FormResult> {
  const ix = indexOf(days);
  const out = new Map<ISODate, FormResult>();
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const r = computeForm(ix, date, ctx(date));
    if (r) out.set(date, r);
  }
  return out;
}

export const SELF_CHECK_MIN_RUNS = 8;

/** Did high Form go with better runs? Run form (SD vs own normal) on Form ≥ 70 days vs Form < 40 days. */
export function formSelfCheck(scores: ReadonlyMap<ISODate, number>, runForm: ReadonlyMap<ISODate, number>): { diffSd: number; nHigh: number; nLow: number } | null {
  const high: number[] = [];
  const low: number[] = [];
  for (const [date, rf] of runForm) {
    const s = scores.get(date);
    if (s == null) continue;
    if (s >= FORM_BANDS.ready) high.push(rf);
    else if (s < FORM_BANDS.steady) low.push(rf);
  }
  if (high.length < SELF_CHECK_MIN_RUNS || low.length < SELF_CHECK_MIN_RUNS) return null;
  return { diffSd: round1(mean(high) - mean(low)), nHigh: high.length, nLow: low.length };
}

export interface WeekBalance {
  /** Sleep minus need over the last 7 nights, scaled to 7 like the Form part (null under 4 nights). */
  sleepVsNeedH: number | null;
  nights: number;
  /** Mean deficit on logged hard days in the last 14 days (null with fewer than 2). */
  hardDayDeficit: number | null;
  hardDays: number;
  loadRatio: number | null;
  /** Easy-run metres per beat, last 21 days vs the 42 before, percent (null with fewer than 3 runs in either). */
  runTrendPct: number | null;
}

export function weekBalance(days: readonly RecoveryDayInput[], today: ISODate): WeekBalance {
  const ix = indexOf(days);
  const debt = sleepDebtPart(ix, today);
  const hard = previous(ix, today, 14, (x) => (x.hard && x.food ? x.food.deficitKcal : null));
  const recent = [0, ...Array.from({ length: 20 }, (_, i) => i + 1)].flatMap((i) => {
    const v = ix.get(addDays(today, -i))?.easyMetersPerBeat;
    return v == null ? [] : [v];
  });
  const before = Array.from({ length: 42 }, (_, i) => ix.get(addDays(today, -(21 + i)))?.easyMetersPerBeat).filter((v): v is number => v != null);
  return {
    sleepVsNeedH: debt.status === "ok" ? debt.values.hours! : null,
    nights: debt.values.nights ?? 0,
    hardDayDeficit: hard.length >= 2 ? Math.round(mean(hard)) : null,
    hardDays: hard.length,
    // Same window and precision as the Form part (the 7 days before today), so the tile and the sheet agree.
    loadRatio: loadRatio(ix, today),
    runTrendPct: recent.length >= 3 && before.length >= 3 ? Math.round((median(recent) / median(before) - 1) * 100) : null,
  };
}
