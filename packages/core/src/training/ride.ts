import { addDays, daysBetween, weekday, weekStartOn, type ISODate } from "../dates";
import { assignDays } from "./schedule";
import type { GeneratedPlan, WeekSummary } from "./generate";
import { HR_ZONE_PCT, measure, type BuildContext, type BuiltWorkout } from "./workouts";
import { HR_ZONES, type Block, type HrZone, type Paces, type Phase, type Step, type Target, type WorkoutSpec, type WorkoutType } from "./types";
import type { Proposal } from "./proposals";

/**
 * Cycling (spec docs/specs/2026-10-23-sykling.md): time- and heart-rate-based plans. Sessions carry km estimates
 * from the rider's usual speed so volume, warnings and the week views keep working.
 */

// ---------------------------------------------------------------- zones

/** Friel zones as share of LTHR. Sweet spot overlaps the top of Z3 and the bottom of Z4. */
const ZONE_PCT = HR_ZONE_PCT;
export const isHrZone = (z: unknown): z is HrZone => typeof z === "string" && (HR_ZONES as readonly string[]).includes(z);

export function hrTarget(zone: HrZone, lthr: number): Target {
  const [lo, hi] = ZONE_PCT[zone];
  return { kind: "hr", zone, minBpm: Math.round(lthr * lo), maxBpm: Math.round(lthr * hi) };
}

/** Zone table for the UI and the coach. */
export const rideZones = (lthr: number) => HR_ZONES.map((z) => ({ zone: z, ...(hrTarget(z, lthr) as { minBpm: number; maxBpm: number }) }));

/** One "pace" for every zone: the rider's usual speed. `measure` then turns minutes into km estimates. */
export function ridePaces(speedKmh: number): Paces {
  const p = 3600 / Math.max(10, speedKmh);
  return { easy: { min: p, max: p }, marathon: p, threshold: p, interval: p, rep: p };
}

export interface RideContext extends BuildContext {
  lthr: number;
  speedKmh: number;
}
export const rideContext = (lthr: number, speedKmh: number): RideContext => ({ paces: ridePaces(speedKmh), lthr, speedKmh });

/** Re-target every heart-rate step for a new LTHR (structure and times unchanged). */
export function rezoneBlocks(blocks: Block[], lthr: number): Block[] {
  const fix = (s: Step): Step => (s.target.kind === "hr" ? { ...s, target: hrTarget(s.target.zone, lthr) } : s);
  return blocks.map((b) => (b.kind === "repeat" ? { ...b, steps: b.steps.map(fix) } : fix(b)));
}

// ---------------------------------------------------------------- fitness

export interface RideRecord {
  date: ISODate;
  distanceM: number;
  timeS: number;
  indoor?: boolean;
  avgPower?: number | null;
  maxHr?: number | null;
}

export interface RideFitness {
  /** Average ride hours per week, last 4 weeks. */
  hoursPerWeek: number;
  /** Start volume (minutes/week): best week of the last 4, capped; careful after a break; 180 without rides. */
  baseMinPerWeek: number;
  longestMin: number;
  speedKmh: number;
  lthr: number;
  lthrSource: "garmin_cycling" | "garmin_running" | "max_hr" | "default";
  /** Rides with power in the last 8 weeks (watts come in part 2). */
  powerSeen: boolean;
  experienced: boolean;
  rideCount: number;
}

const DEFAULT_SPEED = 25;
const NO_RIDES_MIN = 180;

export function rideFitnessFrom(rides: RideRecord[], today: ISODate, garmin: { lthrCycling?: number | null; lthrRunning?: number | null } = {}): RideFitness {
  const valid = rides.filter((r) => r.timeS > 0 && r.date < today && r.date >= addDays(today, -56));
  const last4 = valid.filter((r) => r.date >= addDays(today, -28));
  const weeks = [0, 0, 0, 0];
  for (const r of last4) weeks[Math.min(3, Math.floor((daysBetween(r.date, today) - 1) / 7))]! += r.timeS / 60;
  const avg4 = weeks.reduce((s, x) => s + x, 0) / 4;
  const avg2 = (weeks[0]! + weeks[1]!) / 2;
  const best = Math.max(...weeks);
  const base = !last4.length ? NO_RIDES_MIN : avg2 < avg4 * 0.5 ? Math.min(Math.max(avg4, avg2), avg4 * 1.2) : Math.min(best, avg4 * 1.3);

  const outdoor = valid.filter((r) => !r.indoor && r.timeS >= 1800 && r.distanceM > 0);
  const speedKmh = outdoor.length
    ? outdoor.reduce((s, r) => s + r.distanceM / 1000, 0) / (outdoor.reduce((s, r) => s + r.timeS, 0) / 3600)
    : DEFAULT_SPEED;
  const maxHr = Math.max(0, ...rides.filter((r) => r.date >= addDays(today, -90)).map((r) => r.maxHr ?? 0));
  const [lthr, lthrSource]: [number, RideFitness["lthrSource"]] = garmin.lthrCycling
    ? [garmin.lthrCycling, "garmin_cycling"]
    : garmin.lthrRunning
      ? [garmin.lthrRunning - 5, "garmin_running"]
      : maxHr > 120
        ? [Math.round(maxHr * 0.9), "max_hr"]
        : [165, "default"];
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    hoursPerWeek: r1(avg4 / 60),
    baseMinPerWeek: Math.round(Math.max(90, base)),
    longestMin: Math.round(Math.max(0, ...last4.map((r) => r.timeS / 60))),
    speedKmh: r1(Math.min(40, Math.max(12, speedKmh))),
    lthr,
    lthrSource,
    powerSeen: valid.some((r) => (r.avgPower ?? 0) > 0),
    experienced: last4.length >= 8 && avg4 >= 180,
    rideCount: last4.length,
  };
}

// ---------------------------------------------------------------- sessions

const step = (kind: Step["kind"], s: number, target: Target): Step => ({ kind, duration: { kind: "time", s: Math.round(s) }, target });
const min = (m: number) => m * 60;

/** "45 min", "1 h 30", "3 h". */
export function fmtRideDuration(minutes: number): string {
  const m = Math.round(minutes / 5) * 5;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
}

function finish(type: WorkoutType, title: string, blocks: Block[], ctx: RideContext): BuiltWorkout {
  const m = measure(blocks, ctx.paces);
  return { type, title, blocks, plannedKm: m.km, plannedDurationS: m.s };
}

export function enduranceRide(minutes: number, ctx: RideContext, recovery = false): BuiltWorkout {
  const m = Math.max(20, Math.round(minutes / 5) * 5);
  return finish("easy", `${recovery ? "Recovery ride" : "Endurance ride"} ${fmtRideDuration(m)}`, [step("run", min(m), hrTarget(recovery ? "z1" : "z2", ctx.lthr))], ctx);
}

export function longRide(minutes: number, ctx: RideContext, climbM = 0, indoor = false): BuiltWorkout {
  const m = Math.max(45, Math.round(minutes / 5) * 5);
  if (indoor && m >= 90) {
    // On the trainer: tempo inserts break up the long ride (3 × 10 min, spread out).
    const z2 = (m - 30) / 4;
    return finish(
      "long",
      `Long indoor ride ${fmtRideDuration(m)} with 3 × 10 min tempo`,
      [
        step("run", min(z2), hrTarget("z2", ctx.lthr)),
        { kind: "repeat", times: 3, steps: [step("run", min(10), hrTarget("z3", ctx.lthr)), step("recover", min(z2), hrTarget("z2", ctx.lthr))] },
      ],
      ctx,
    );
  }
  const title = `${indoor ? "Long indoor ride" : "Long ride"} ${fmtRideDuration(m)}${climbM >= 100 ? `, about ${climbM} m climbing` : ""}`;
  return finish("long", title, [step("run", min(m), hrTarget("z2", ctx.lthr))], ctx);
}

/** Indoors: a long ride of at most 2.5 h, easy rides of at most 90 min, about 15 % less weekly time. */
export const INDOOR = { longMaxMin: 150, easyMaxMin: 90, volume: 0.85 } as const;

/** On/off repeats with a 15 min warm-up and 10 min cool-down (smaller for small weeks). */
function repeats(type: WorkoutType, title: string, times: number, onMin: number, offMin: number, zone: HrZone, ctx: RideContext, small = false): BuiltWorkout {
  return finish(
    type,
    title,
    [
      step("warmup", min(small ? 10 : 15), hrTarget("z2", ctx.lthr)),
      { kind: "repeat", times, steps: [step("run", min(onMin), hrTarget(zone, ctx.lthr)), step("recover", min(offMin), hrTarget("z1", ctx.lthr))] },
      step("cooldown", min(small ? 5 : 10), hrTarget("z1", ctx.lthr)),
    ],
    ctx,
  );
}

export type RideKind = "sweetspot" | "tempo" | "threshold" | "vo2" | "climb";
const SWEETSPOT: [number, number][] = [[3, 10], [3, 12], [2, 20], [3, 15], [2, 25]];
const TEMPO_MIN = [20, 30, 40, 50, 60];
const THRESHOLD: [number, number][] = [[3, 8], [4, 8], [3, 10], [2, 15], [3, 12]];
const VO2: [number, number][] = [[5, 3], [6, 3], [5, 4], [4, 5], [5, 5]];
const CLIMB: [number, number][] = [[4, 8], [5, 8], [3, 12], [4, 12], [3, 15]];
const at = <T,>(t: readonly T[], l: number): T => t[Math.max(0, Math.min(t.length - 1, l))]!;

export function rideQuality(kind: RideKind, level: number, ctx: RideContext, hills: boolean, small = false): BuiltWorkout {
  switch (kind) {
    case "sweetspot": {
      const [n, m] = at(SWEETSPOT, level);
      return repeats("tempo", `Sweet spot ${n} × ${m} min`, n, m, 5, "ss", ctx, small);
    }
    case "tempo": {
      const m = at(TEMPO_MIN, level);
      return finish(
        "tempo",
        `Tempo ${fmtRideDuration(m)}`,
        [step("warmup", min(small ? 10 : 15), hrTarget("z2", ctx.lthr)), step("run", min(m), hrTarget("z3", ctx.lthr)), step("cooldown", min(10), hrTarget("z1", ctx.lthr))],
        ctx,
      );
    }
    case "threshold": {
      const [n, m] = at(THRESHOLD, level);
      return repeats("threshold", `Threshold ${n} × ${m} min`, n, m, 5, "z4", ctx, small);
    }
    case "vo2": {
      const [n, m] = at(VO2, level);
      return repeats("intervals", `VO2 ${n} × ${m} min`, n, m, m, "z5", ctx, small);
    }
    case "climb": {
      const [n, m] = at(CLIMB, level);
      // Without hills: the same effort on the flat or a trainer.
      return repeats("threshold", `${hills ? "Climb" : "Climb-effort"} ${n} × ${m} min`, n, m, 5, "z4", ctx, small);
    }
  }
}

/** 30 min all-out but even: the average heart rate sets the zones (spec §5). */
export function rideTest(ctx: RideContext): BuiltWorkout {
  return finish(
    "test",
    "Ride test: 30 min",
    [
      step("warmup", min(15), hrTarget("z2", ctx.lthr)),
      step("warmup", min(10), hrTarget("z3", ctx.lthr)),
      step("run", min(30), { kind: "none" }),
      step("cooldown", min(10), hrTarget("z1", ctx.lthr)),
    ],
    ctx,
  );
}

function openers(ctx: RideContext): BuiltWorkout {
  return repeats("intervals", "Openers 3 × 3 min", 3, 3, 3, "z4", ctx, true);
}

function eventDay(km: number, ctx: RideContext): BuiltWorkout {
  return finish("race", `Event day: ${Math.round(km)} km`, [{ kind: "run", duration: { kind: "distance", m: Math.round(km * 1000) }, target: { kind: "none" } }], ctx);
}

const RIDE_LABEL: Record<WorkoutType, string> = {
  easy: "Endurance ride",
  long: "Long ride",
  intervals: "Intervals",
  threshold: "Threshold",
  tempo: "Tempo",
  strides: "Endurance ride",
  race: "Event",
  test: "Ride test",
};
export const rideDefaultTitle = (type: WorkoutType, minutes: number) => `${RIDE_LABEL[type]} ${fmtRideDuration(minutes)}`;

/** Rebuild a ride session of a type and length (coach "replace", volume changes). */
export function rideByType(type: WorkoutType, minutes: number, level: number, ctx: RideContext, indoor = false): BuiltWorkout {
  switch (type) {
    case "long":
      return longRide(indoor ? Math.min(INDOOR.longMaxMin, minutes) : minutes, ctx, 0, indoor);
    case "intervals":
      return rideQuality("vo2", level, ctx, false);
    case "threshold":
      return rideQuality("threshold", level, ctx, false);
    case "tempo":
      return rideQuality("sweetspot", level, ctx, false);
    default:
      return enduranceRide(indoor ? Math.min(INDOOR.easyMaxMin, minutes) : minutes, ctx);
  }
}

// ---------------------------------------------------------------- generator

export type RideProfile = "flat" | "rolling" | "mountain";
export const rideProfile = (km: number | null, elevationM: number | null): RideProfile => {
  if (!km || elevationM == null) return "rolling";
  const perKm = elevationM / km;
  return perKm < 8 ? "flat" : perKm <= 15 ? "rolling" : "mountain";
};
const PROFILE_SPEED: Record<RideProfile, number> = { flat: 1, rolling: 0.9, mountain: 0.8 };

const ROTATION: Record<RideProfile, Record<"build" | "peak", RideKind[]>> = {
  flat: { build: ["sweetspot", "tempo", "threshold", "vo2"], peak: ["tempo", "sweetspot", "threshold"] },
  rolling: { build: ["sweetspot", "climb", "threshold", "vo2"], peak: ["climb", "threshold", "sweetspot"] },
  mountain: { build: ["climb", "sweetspot", "threshold", "vo2"], peak: ["climb", "sweetspot", "climb"] },
};
const BUILD_BLOCKS: RideKind[][] = [
  ["vo2", "sweetspot", "threshold"],
  ["sweetspot", "threshold"],
  ["tempo", "sweetspot"],
];

export type RideGoal = { kind: "event"; date: ISODate; km: number; elevationM?: number | null } | { kind: "build" };

export interface RidePlanInput {
  goal: RideGoal;
  startDate: ISODate;
  weekdays: number[];
  longRideWeekday: number;
  ridesPerWeek: number;
  lthr: number;
  speedKmh: number;
  /** Minutes per week to start from (week 1 matches it). */
  startMinPerWeek: number;
  deficitKcal: number;
  recentLongestMin?: number;
  hills?: boolean;
  /** On a trainer (winter): shorter long and easy rides, climbs as climb-effort. */
  indoor?: boolean;
  experienced?: boolean;
  untilDate?: ISODate;
}

const BLOCK = 4;
/** Easy rides last at least an hour; recovery rides 45–60 min. */
const MIN_EASY_MIN = 60;
const RECOVERY_MIN: [number, number] = [45, 60];
const TEST_EVERY = 8;
const MAX_WEEK_MIN = 15 * 60;
const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const dateIn = (monday: ISODate, wd: number): ISODate => addDays(monday, (wd + 6) % 7);

function eventPhases(n: number, taper: number, experienced: boolean): Phase[] {
  const t = Math.min(n, taper);
  const m = n - t;
  const out: Phase[] = [];
  if (m > 0) {
    if (m < 3) out.push(...Array<Phase>(m).fill("peak"));
    else {
      const peak = clamp(Math.round(m * 0.25), 1, 4);
      const build = experienced ? clamp(m - peak, 1, 12) : clamp(Math.round(m * 0.45), 1, 8);
      const base = Math.max(experienced ? 0 : 1, m - peak - build);
      out.push(...Array<Phase>(base).fill("base"), ...Array<Phase>(m - peak - base).fill("build"), ...Array<Phase>(peak).fill("peak"));
    }
  }
  out.push(...Array<Phase>(t).fill("taper"));
  for (let i = 3; i < m - 1; i += 4) out[i] = "recovery";
  return out;
}

/** Expected event time (minutes) at the rider's usual speed, slowed by the profile. */
export const eventMinutes = (km: number, speedKmh: number, profile: RideProfile) => (km / (speedKmh * PROFILE_SPEED[profile])) * 60;

export function generateRidePlan(input: RidePlanInput): GeneratedPlan {
  const ctx = rideContext(input.lthr, input.speedKmh);
  const isEvent = input.goal.kind === "event";
  const ev = input.goal.kind === "event" ? input.goal : null;
  const profile = rideProfile(ev?.km ?? null, ev?.elevationM ?? null);
  const indoor = !!input.indoor;
  const hills = !!input.hills && !indoor;
  const rides = clamp(Math.min(input.ridesPerWeek, new Set(input.weekdays).size), 1, 6);
  const firstMonday = weekStartOn(input.startDate, 1);
  const lastDate = ev ? ev.date : (input.untilDate ?? addDays(input.startDate, BLOCK * 7 - 1));
  const nWeeks = Math.max(1, daysBetween(firstMonday, weekStartOn(lastDate, 1)) / 7 + 1);
  const taperLen = ev ? (ev.km <= 150 ? 1 : 2) : 0;
  const phases: Phase[] = isEvent
    ? eventPhases(nWeeks, taperLen, !!input.experienced)
    : Array.from({ length: nWeeks }, (_, i) => (i % BLOCK === BLOCK - 1 ? "recovery" : "build"));

  const start = Math.max(rides * MIN_EASY_MIN, input.startMinPerWeek * (indoor ? INDOOR.volume : 1));
  const growth = input.deficitKcal > 500 ? 0.05 : 0.08;
  const expected = ev ? eventMinutes(ev.km, input.speedKmh, profile) : 0;
  // The ceiling comes from the goal (as for running): ~1.6 × the event time per week, or 90 min per ride
  // for build plans. The start decides how fast the plan gets there and how far it can go (≤ 2 × start).
  const goalMin =
    clamp(ev ? Math.max(rides * 75, expected * 1.6) : rides * 90, rides * MIN_EASY_MIN, Math.min(rides * 150, MAX_WEEK_MIN)) *
    (indoor ? INDOOR.volume : 1);
  const peak = Math.max(start, Math.min(Math.max(goalMin, start * 1.1), start * 2, MAX_WEEK_MIN));
  const longTarget = Math.min(indoor ? INDOOR.longMaxMin : 360, ev ? Math.max(90, expected * 0.8) : 210);
  const share = rides <= 2 ? 0.5 : rides === 3 ? 0.4 : 0.3;
  const longStart = Math.min(longTarget, Math.max(60, start * share, input.recentLongestMin ?? 0));
  const qualityWeeks = phases.filter((p) => p === "build" || p === "peak").length;
  const growthWeeks = phases.filter((p) => p !== "taper" && p !== "recovery").length;
  const TAPER = taperLen === 1 ? [0.65] : [0.75, 0.55];

  const workouts: WorkoutSpec[] = [];
  const weeks: WeekSummary[] = [];
  let level = start;
  let growthIdx = 0;
  let qualityIdx = 0;
  let taperIdx = 0;
  let peakReached = start;
  let lastLong = longStart;

  for (let w = 0; w < nWeeks; w++) {
    const phase = phases[w]!;
    const monday = addDays(firstMonday, w * 7);
    let minutes: number;
    if (phase === "taper") minutes = peakReached * TAPER[taperIdx++]!;
    else if (phase === "recovery") minutes = level * 0.75;
    else {
      if (growthIdx > 0) level = Math.min(peak, level * (1 + growth));
      minutes = level;
      growthIdx++;
      peakReached = Math.max(peakReached, level);
    }

    const partialFirst = w === 0 && input.startDate > monday;
    const isQualityWeek = (phase === "build" || phase === "peak") && !partialFirst;
    const byProgress = !isEvent ? Math.min(4, Math.floor(w / BLOCK)) : qualityWeeks > 1 ? Math.round((qualityIdx / (qualityWeeks - 1)) * 4) : 2;
    const byVolume = minutes < 240 ? 0 : minutes < 360 ? 1 : minutes < 480 ? 2 : minutes < 600 ? 3 : 4;
    const lvl = Math.min(byProgress, byVolume);
    const count = isQualityWeek ? (rides >= 5 && minutes >= 480 ? 2 : 1) : 0;
    const rotation = isEvent ? ROTATION[profile][phase === "peak" ? "peak" : "build"] : BUILD_BLOCKS[Math.floor(w / BLOCK) % BUILD_BLOCKS.length]!;
    const k = isEvent ? qualityIdx : w % BLOCK;
    const kinds = Array.from({ length: Math.min(count, rotation.length) }, (_, i) => rotation[(k + i) % rotation.length]!);
    if (isQualityWeek) qualityIdx++;
    const testWeek = !isEvent && !partialFirst && w % TEST_EVERY === TEST_EVERY - 1 && rides >= 3 && minutes >= 240;
    const isEventWeek = isEvent && w === nWeeks - 1;
    const built: { date: ISODate; w: BuiltWorkout }[] = [];
    const small = minutes < 240;

    if (isEventWeek) {
      built.push({ date: ev!.date, w: eventDay(ev!.km, ctx) });
      const before = [...new Set(input.weekdays)].map((wd) => dateIn(monday, wd)).filter((d) => d < addDays(ev!.date, -1)).sort();
      const pick = before.slice(-Math.max(0, rides - 1));
      pick.forEach((d, i) => {
        const opener = i === pick.length - 1 && daysBetween(d, ev!.date) >= 2 && daysBetween(d, ev!.date) <= 3 && rides >= 3;
        built.push({ date: d, w: opener ? openers(ctx) : enduranceRide(60, ctx) });
      });
    } else {
      const progress = !isEvent
        ? Math.min(1, Math.max(0, growthIdx - 1) / 12)
        : growthWeeks > 1
          ? Math.min(1, Math.max(0, growthIdx - 1) / (growthWeeks - 1))
          : 1;
      const longGoal = longStart + (longTarget - longStart) * progress;
      const scale = phase === "recovery" ? 0.75 : phase === "taper" ? 0.6 : 1;
      const step = clamp(lastLong * 0.1, 15, 30);
      const longMax = Math.min(minutes * 0.55, phase === "recovery" || phase === "taper" ? Infinity : lastLong + step, indoor ? INDOOR.longMaxMin : 360);
      const longMin = Math.max(45, Math.min(longMax, Math.max(minutes * share, longGoal * scale)));
      if (phase !== "recovery" && phase !== "taper") lastLong = Math.max(lastLong, longMin);
      // Climbing goal on hilly events: a share of the event's climbing, scaled to this ride's length.
      const climb =
        ev && profile !== "flat" && ev.elevationM && (phase === "build" || phase === "peak")
          ? Math.round((0.6 * ev.elevationM * Math.min(1, longMin / expected)) / 50) * 50
          : 0;
      const long = longRide(longMin, ctx, indoor ? 0 : climb, indoor);

      const quality: BuiltWorkout[] = testWeek
        ? [rideTest(ctx)]
        : phase === "taper" && rides >= 3 && !partialFirst
          ? [openers(ctx)]
          : kinds.map((kd) => rideQuality(kd, phase === "base" ? 0 : lvl, ctx, hills, small));
      const qualityMin = quality.reduce((s, q) => s + q.plannedDurationS / 60, 0);
      let easyCount = Math.max(0, rides - 1 - quality.length);
      const left = Math.max(0, minutes - long.plannedDurationS / 60 - qualityMin);
      // Rides shorter than an hour are hardly worth it: drop one rather than make them short.
      while (easyCount > 1 && left / easyCount < MIN_EASY_MIN) easyCount--;
      const days = assignDays(input.weekdays, input.longRideWeekday, true, quality.length, easyCount);
      if (days.long != null) built.push({ date: dateIn(monday, days.long), w: long });
      quality.forEach((q, i) => days.hard[i] != null && built.push({ date: dateIn(monday, days.hard[i]!), w: q }));
      const hardDays = [...(days.long == null ? [] : [days.long]), ...days.hard.slice(0, quality.length)];
      const easyDays = days.easy.slice(0, easyCount);
      const recovery = easyDays.map((d) => hardDays.some((h) => (d - h + 7) % 7 === 1));
      const weights = recovery.map((r) => (r ? 0.6 : 1));
      const totalW = weights.reduce((a, b) => a + b, 0) || 1;
      easyDays.forEach((d, i) => {
        const m = recovery[i]
          ? clamp((left * weights[i]!) / totalW, RECOVERY_MIN[0], RECOVERY_MIN[1])
          : clamp((left * weights[i]!) / totalW, MIN_EASY_MIN, Math.max(MIN_EASY_MIN, Math.min(indoor ? INDOOR.easyMaxMin : Infinity, (long.plannedDurationS / 60) * 0.8)));
        built.push({ date: dateIn(monday, d), w: enduranceRide(m, ctx, recovery[i]) });
      });
    }

    const kept = built.filter((b) => b.date >= input.startDate).sort((a, b) => (a.date < b.date ? -1 : 1));
    for (const b of kept) workouts.push({ ...b.w, date: b.date, week: w + 1, phase });
    weeks.push({ week: w + 1, startDate: monday, phase, km: r1(kept.reduce((s, b) => s + b.w.plannedKm, 0)) });
  }
  return { workouts, weeks, peakKm: r1((peak / 60) * input.speedKmh), predictedTimeS: ev ? Math.round(expected * 60) : null, racePaceS: null };
}

/** Minutes per week of a generated ride plan (for previews in hours). */
export const weekMinutes = (plan: GeneratedPlan, week: number) =>
  Math.round(plan.workouts.filter((w) => w.week === week).reduce((s, w) => s + w.plannedDurationS, 0) / 60);

// ---------------------------------------------------------------- test → zones

export interface RideTestRun {
  date: ISODate;
  laps: { timeS: number; avgHr: number | null }[];
}

/** LTHR from the 30 min test lap (≈ average of the last 20 min + 1): proposed when it moves 2 bpm or more. */
export function rideTestProposal(planLthr: number, run: RideTestRun): Proposal | null {
  const lap = run.laps.filter((l) => l.timeS >= 1080 && l.timeS <= 1920 && (l.avgHr ?? 0) > 100).sort((a, b) => (b.avgHr ?? 0) - (a.avgHr ?? 0))[0];
  if (!lap) return null;
  const lthr = Math.round(lap.avgHr! + 1);
  if (Math.abs(lthr - planLthr) < 2) return null;
  return {
    kind: "paces",
    summary: `Ride test (${run.date}): threshold heart rate ${lthr} (plan ${planLthr}). Update your zones?`,
    changes: [{ op: "rezone", lthr }],
  };
}

export const RIDE_TYPES = new Set([
  "cycling",
  "road_biking",
  "mountain_biking",
  "gravel_cycling",
  "cyclocross",
  "track_cycling",
  "recumbent_cycling",
  "downhill_biking",
  "bmx",
  "hand_cycling",
  "indoor_cycling",
  "virtual_ride",
  "e_bike_fitness",
  "e_bike_mountain",
  "e_enduro_mtb",
]);
export const isRide = (typeKey: string) => RIDE_TYPES.has(typeKey);
export const weekdayOf = weekday;
