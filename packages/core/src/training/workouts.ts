import type { Block, CoachBlock, CoachStep, PaceZone, Paces, RaceDistance, Step, Target, WorkoutType } from "./types";

export interface BuiltWorkout {
  type: WorkoutType;
  title: string;
  blocks: Block[];
  plannedKm: number;
  plannedDurationS: number;
}

export interface BuildContext {
  paces: Paces;
  /** Goal race pace (s/km) for race-day workouts. */
  racePaceS?: number;
}

const BAND = 5; // ± s/km around a single pace

export function targetFor(zone: PaceZone, paces: Paces, racePaceS?: number): Target {
  if (zone === "easy") return { kind: "pace", zone, minSecPerKm: paces.easy.min, maxSecPerKm: paces.easy.max };
  const center =
    zone === "marathon"
      ? paces.marathon
      : zone === "threshold"
        ? paces.threshold
        : zone === "interval"
          ? paces.interval
          : zone === "rep"
            ? paces.rep
            : (racePaceS ?? paces.threshold);
  const band = zone === "race" ? 3 : BAND;
  return { kind: "pace", zone, minSecPerKm: center - band, maxSecPerKm: center + band };
}

const paceOf = (t: Target, paces: Paces): number =>
  t.kind === "pace" ? (t.minSecPerKm + t.maxSecPerKm) / 2 : paces.easy.max;

const step = (kind: Step["kind"], duration: Step["duration"], target: Target): Step => ({ kind, duration, target });
const dist = (km: number) => ({ kind: "distance" as const, m: Math.round(km * 1000) });
const time = (s: number) => ({ kind: "time" as const, s });

/** Distance (km) and duration (s) of a block list, estimating time steps at their target pace. */
export function measure(blocks: Block[], paces: Paces): { km: number; s: number } {
  let km = 0;
  let s = 0;
  const one = (st: Step) => {
    const pace = paceOf(st.target, paces);
    if (st.duration.kind === "distance") {
      km += st.duration.m / 1000;
      s += (st.duration.m / 1000) * pace;
    } else if (st.duration.kind === "time") {
      s += st.duration.s;
      km += st.duration.s / pace;
    }
  };
  for (const b of blocks) {
    if (b.kind === "repeat") for (let i = 0; i < b.times; i++) b.steps.forEach(one);
    else one(b);
  }
  return { km: Math.round(km * 10) / 10, s: Math.round(s) };
}

function finish(type: WorkoutType, title: string, blocks: Block[], ctx: BuildContext): BuiltWorkout {
  const m = measure(blocks, ctx.paces);
  return { type, title, blocks, plannedKm: m.km, plannedDurationS: m.s };
}

const WARMUP_KM = 2;
const COOLDOWN_KM = 1.5;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function easyRun(km: number, ctx: BuildContext, label = "Easy run"): BuiltWorkout {
  const k = r1(Math.max(2, km));
  return finish("easy", `${label} ${k} km`, [step("run", dist(k), targetFor("easy", ctx.paces))], ctx);
}

/** Smaller warm-up/cool-down and fewer repeats, so a session fits a small week. */
export interface Shrink {
  warm?: number;
  cool?: number;
  /** Repeats (or tempo km) removed from the table value; never below 2. */
  cut?: number;
}

export function stridesRun(km: number, ctx: BuildContext): BuiltWorkout {
  const easyKm = r1(Math.max(2, km - 1.5));
  return finish(
    "strides",
    `Easy ${easyKm} km + 6 strides`,
    [
      step("run", dist(easyKm), targetFor("easy", ctx.paces)),
      {
        kind: "repeat",
        times: 6,
        steps: [step("run", time(20), targetFor("rep", ctx.paces)), step("recover", time(60), { kind: "none" })],
      },
    ],
    ctx,
  );
}

export function longRun(km: number, ctx: BuildContext, marathonPaceKm = 0): BuiltWorkout {
  const k = r1(Math.max(4, km));
  if (marathonPaceKm <= 0) return finish("long", `Long run ${k} km`, [step("run", dist(k), targetFor("easy", ctx.paces))], ctx);
  const mp = r1(Math.min(marathonPaceKm, k - 3));
  return finish(
    "long",
    `Long run ${k} km, ${mp} km at marathon pace`,
    [
      step("run", dist(r1(k - mp - 1)), targetFor("easy", ctx.paces)),
      step("run", dist(mp), targetFor("marathon", ctx.paces)),
      step("cooldown", dist(1), targetFor("easy", ctx.paces)),
    ],
    ctx,
  );
}

const recoverFor = (m: number) => (m <= 400 ? 90 : m <= 800 ? 120 : m <= 1000 ? 150 : 180);
const at = <T,>(table: readonly T[], level: number): T => table[Math.max(0, Math.min(table.length - 1, level))]!;

/**
 * Quality session families (spec 2026-10-22 §3). Each has a table for level 0–4; `Shrink` makes it fit small weeks.
 * Everything runs on flat ground except hills, which only come with the hills choice.
 */
export type QualityKind = "short" | "long" | "racePace" | "threshold" | "fartlek" | "hills" | "tempo";

const SHORT_REPS: [number, number][] = [[8, 400], [10, 400], [6, 600], [8, 600], [12, 400]];
const LONG_REPS: [number, number][] = [[5, 1000], [6, 1000], [4, 1200], [5, 1200], [3, 1600]];
const RACE_REPS: Record<RaceDistance, [number, number][]> = {
  "5k": [[4, 1000], [5, 1000], [3, 1600], [4, 1200], [3, 2000]],
  "10k": [[3, 2000], [4, 1600], [3, 2500], [2, 3000], [3, 3000]],
  half: [[2, 3000], [3, 3000], [2, 5000], [3, 4000], [2, 6000]],
  marathon: [[2, 3000], [3, 3000], [2, 5000], [3, 4000], [2, 6000]],
};
/** Hard minutes, easy minutes (seconds). */
const FARTLEK: [number, number, number][] = [[8, 60, 60], [10, 60, 60], [6, 120, 60], [8, 120, 60], [5, 180, 90]];
const HILLS: [number, number][] = [[6, 60], [8, 60], [10, 60], [6, 90], [8, 90]];

const label = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);

/** Interval-pace repeats of `m` metres (the classic session; kept for the coach's "replace"). */
export function intervals(level: number, distance: RaceDistance, ctx: BuildContext, o: Shrink = {}): BuiltWorkout {
  const table = distance === "5k" || distance === "10k" ? SHORT_REPS_OLD : LONG_REPS;
  const [times, m] = at(table, level);
  return repeatsWorkout("intervals", Math.max(2, times - (o.cut ?? 0)), m, "interval", ctx, o);
}
const SHORT_REPS_OLD: [number, number][] = [[5, 800], [6, 800], [5, 1000], [6, 1000], [5, 1200]];

/** Short and sharp, for taper weeks. */
export function sharpener(ctx: BuildContext): BuiltWorkout {
  return repeatsWorkout("intervals", 4, 400, "interval", ctx);
}

function repeatsWorkout(type: WorkoutType, times: number, m: number, zone: PaceZone, ctx: BuildContext, o: Shrink = {}, title?: string): BuiltWorkout {
  return finish(
    type,
    title ?? `Intervals ${times} × ${label(m)}`,
    [
      step("warmup", dist(o.warm ?? WARMUP_KM), targetFor("easy", ctx.paces)),
      {
        kind: "repeat",
        times,
        steps: [step("run", dist(m / 1000), targetFor(zone, ctx.paces, ctx.racePaceS)), step("recover", time(recoverFor(m)), { kind: "none" })],
      },
      step("cooldown", dist(o.cool ?? COOLDOWN_KM), targetFor("easy", ctx.paces)),
    ],
    ctx,
  );
}

export function shortReps(level: number, ctx: BuildContext, o: Shrink = {}): BuiltWorkout {
  const [t, m] = at(SHORT_REPS, level);
  const times = Math.max(3, t - 2 * (o.cut ?? 0));
  return repeatsWorkout("intervals", times, m, m <= 400 ? "rep" : "interval", ctx, o, `Short reps ${times} × ${label(m)}`);
}

export function longReps(level: number, ctx: BuildContext, o: Shrink = {}): BuiltWorkout {
  const [t, m] = at(LONG_REPS, level);
  const times = Math.max(2, t - (o.cut ?? 0));
  return repeatsWorkout("intervals", times, m, "interval", ctx, o, `Intervals ${times} × ${label(m)}`);
}

const PACE_NAME: Record<RaceDistance, string> = { "5k": "5K", "10k": "10K", half: "Half marathon", marathon: "Marathon" };

/** Reps at goal race pace (needs ctx.racePaceS; without it, threshold pace). */
export function racePaceReps(level: number, distance: RaceDistance, ctx: BuildContext, o: Shrink = {}): BuiltWorkout {
  const [t, m] = at(RACE_REPS[distance], level);
  const times = Math.max(2, t - (o.cut ?? 0));
  const zone: PaceZone = ctx.racePaceS ? "race" : "threshold";
  return repeatsWorkout("intervals", times, m, zone, ctx, o, `${PACE_NAME[distance]} pace ${times} × ${label(m)}`);
}

/** Time-based surges, run by feel on any road: no track or exact distances needed. */
export function fartlek(level: number, ctx: BuildContext, o: Shrink = {}): BuiltWorkout {
  const [t, on, off] = at(FARTLEK, level);
  const times = Math.max(4, t - 2 * (o.cut ?? 0));
  const zone: PaceZone = on <= 60 ? "interval" : "threshold";
  const mins = (s: number) => (s % 60 ? `${s / 60}`.replace(".5", "½") : `${s / 60}`);
  return finish(
    "intervals",
    `Fartlek ${times} × ${mins(on)} min`,
    [
      step("warmup", dist(o.warm ?? WARMUP_KM), targetFor("easy", ctx.paces)),
      { kind: "repeat", times, steps: [step("run", time(on), targetFor(zone, ctx.paces)), step("recover", time(off), { kind: "none" })] },
      step("cooldown", dist(o.cool ?? COOLDOWN_KM), targetFor("easy", ctx.paces)),
    ],
    ctx,
  );
}

/** Uphill repeats by effort (no pace target), jog back down. */
export function hillReps(level: number, ctx: BuildContext, o: Shrink = {}): BuiltWorkout {
  const [t, s] = at(HILLS, level);
  const times = Math.max(4, t - 2 * (o.cut ?? 0));
  return finish(
    "intervals",
    `Hills ${times} × ${s} s`,
    [
      step("warmup", dist(o.warm ?? WARMUP_KM), targetFor("easy", ctx.paces)),
      { kind: "repeat", times, steps: [step("run", time(s), { kind: "none" }), step("recover", time(Math.round(s * 1.5)), { kind: "none" })] },
      step("cooldown", dist(o.cool ?? COOLDOWN_KM), targetFor("easy", ctx.paces)),
    ],
    ctx,
  );
}

/** 5K time trial: all-out but even, no pace target. Its result updates the plan's paces (spec §5). */
export function fitnessTest(ctx: BuildContext): BuiltWorkout {
  return finish(
    "test",
    "Fitness test: 5K time trial",
    [
      step("warmup", dist(WARMUP_KM), targetFor("easy", ctx.paces)),
      step("run", dist(5), { kind: "none" }),
      step("cooldown", dist(COOLDOWN_KM), targetFor("easy", ctx.paces)),
    ],
    ctx,
  );
}

const THRESHOLD: [number, number][] = [[3, 8], [2, 12], [3, 10], [2, 15], [4, 10]];

export function threshold(level: number, ctx: BuildContext, o: Shrink = {}): BuiltWorkout {
  const [t0, min] = at(THRESHOLD, level);
  const times = Math.max(2, t0 - (o.cut ?? 0));
  return finish(
    "threshold",
    `Threshold ${times} × ${min} min`,
    [
      step("warmup", dist(o.warm ?? WARMUP_KM), targetFor("easy", ctx.paces)),
      {
        kind: "repeat",
        times,
        steps: [step("run", time(min * 60), targetFor("threshold", ctx.paces)), step("recover", time(90), { kind: "none" })],
      },
      step("cooldown", dist(o.cool ?? COOLDOWN_KM), targetFor("easy", ctx.paces)),
    ],
    ctx,
  );
}

const TEMPO_KM: Record<RaceDistance, number[]> = {
  "5k": [3, 4, 5, 5, 6],
  "10k": [4, 5, 6, 6, 7],
  half: [4, 5, 6, 7, 8],
  marathon: [5, 6, 8, 10, 12],
};

export function tempo(level: number, distance: RaceDistance, ctx: BuildContext, o: Shrink = {}): BuiltWorkout {
  const km = Math.max(2, at(TEMPO_KM[distance], level) - (o.cut ?? 0));
  return finish(
    "tempo",
    `Marathon pace ${km} km`,
    [
      step("warmup", dist(o.warm ?? WARMUP_KM), targetFor("easy", ctx.paces)),
      step("run", dist(km), targetFor("marathon", ctx.paces)),
      step("cooldown", dist(o.cool ?? 1), targetFor("easy", ctx.paces)),
    ],
    ctx,
  );
}

export type QualityType = "intervals" | "threshold" | "tempo";

function makeQuality(kind: QualityKind, level: number, distance: RaceDistance, ctx: BuildContext, o?: Shrink): BuiltWorkout {
  switch (kind) {
    case "short":
      return shortReps(level, ctx, o);
    case "long":
      return longReps(level, ctx, o);
    case "racePace":
      return distance === "marathon" ? tempo(level, distance, ctx, o) : racePaceReps(level, distance, ctx, o);
    case "threshold":
      return threshold(level, ctx, o);
    case "fartlek":
      return fartlek(level, ctx, o);
    case "hills":
      return hillReps(level, ctx, o);
    case "tempo":
      return tempo(level, distance, ctx, o);
  }
}

/**
 * The biggest version of a quality session (at or below `level`) that fits `budgetKm`.
 * Falls back to short warm-up/cool-down and fewer repeats for small weeks.
 */
export function qualityFor(kind: QualityKind | QualityType, level: number, distance: RaceDistance, ctx: BuildContext, budgetKm: number): BuiltWorkout {
  const k: QualityKind = kind === "intervals" ? "long" : kind;
  const make = (l: number, o?: Shrink) => makeQuality(k, l, distance, ctx, o);
  for (let l = Math.max(0, level); l >= 0; l--) {
    const w = make(l);
    if (w.plannedKm <= budgetKm * 1.1) return w;
  }
  let best = make(0, { warm: 1, cool: 1 });
  for (let cut = 1; cut <= 3 && best.plannedKm > budgetKm * 1.1; cut++) best = make(0, { warm: 1, cool: 1, cut });
  return best;
}

const RACE_LABEL: Record<RaceDistance, string> = { "5k": "5K", "10k": "10K", half: "Half marathon", marathon: "Marathon" };

export function raceDay(distance: RaceDistance, km: number, ctx: BuildContext): BuiltWorkout {
  return finish("race", `Race day: ${RACE_LABEL[distance]}`, [step("run", dist(km), targetFor("race", ctx.paces, ctx.racePaceS))], ctx);
}

/** Rebuild a workout of a given type and size (used by AI "replace" and volume changes). */
export function buildByType(type: WorkoutType, km: number, distance: RaceDistance, level: number, ctx: BuildContext): BuiltWorkout {
  switch (type) {
    case "easy":
      return easyRun(km, ctx);
    case "strides":
      return stridesRun(km, ctx);
    case "long":
      return longRun(km, ctx);
    case "intervals":
      return intervals(level, distance, ctx);
    case "threshold":
      return threshold(level, ctx);
    case "tempo":
      return tempo(level, distance, ctx);
    case "race":
    case "test":
      return easyRun(km, ctx); // races and tests are only placed by the generator
  }
}

/** Longer/shorter quality session: same reps, the difference goes on the easy cool-down (min 0.5 km). */
export function resizeQuality(blocks: Block[], deltaKm: number, paces: Paces): Block[] {
  const out = blocks.map((b) => ({ ...b })) as Block[];
  const i = out.map((b) => b.kind).lastIndexOf("cooldown");
  if (i >= 0) {
    const cd = out[i] as Step;
    const m = cd.duration.kind === "distance" ? cd.duration.m : 0;
    out[i] = { ...cd, duration: { kind: "distance", m: Math.max(500, Math.round((m + deltaKm * 1000) / 100) * 100) } };
  } else if (deltaKm > 0) {
    out.push(step("cooldown", dist(deltaKm), targetFor("easy", paces)));
  }
  return out;
}

/** Re-target every pace step for new paces (keeps structure, distances and times). */
export function repaceBlocks(blocks: Block[], paces: Paces, racePaceS?: number): Block[] {
  const fix = (s: Step): Step => (s.target.kind === "pace" ? { ...s, target: targetFor(s.target.zone, paces, racePaceS) } : s);
  return blocks.map((b) => (b.kind === "repeat" ? { ...b, steps: b.steps.map(fix) } : fix(b)));
}

/** Scale distance steps of an easy/long/strides workout to a new total. */
export function rescaleBlocks(blocks: Block[], factor: number): Block[] {
  return blocks.map((b) =>
    b.kind !== "repeat" && b.duration.kind === "distance" && b.kind === "run" && b.target.kind === "pace" && b.target.zone === "easy"
      ? { ...b, duration: { kind: "distance", m: Math.max(1000, Math.round((b.duration.m * factor) / 100) * 100) } }
      : b,
  );
}

const TYPE_LABEL: Record<WorkoutType, string> = {
  easy: "Easy run",
  long: "Long run",
  intervals: "Intervals",
  threshold: "Threshold",
  tempo: "Tempo",
  strides: "Easy run with strides",
  race: "Race",
  test: "Fitness test",
};
export const defaultTitle = (type: WorkoutType, km: number) => `${TYPE_LABEL[type]} ${r1(km)} km`;

/** Coach steps → blocks. No zone: easy (recover: no target). km wins over minutes; neither = lap button. */
export function blocksFromSteps(steps: readonly CoachBlock[], ctx: BuildContext): Block[] {
  const one = (s: CoachStep): Step => {
    const zone = s.zone ?? (s.kind === "recover" ? "none" : "easy");
    const target: Target = zone === "none" ? { kind: "none" } : targetFor(zone, ctx.paces, ctx.racePaceS);
    const duration: Step["duration"] =
      s.km != null && s.km > 0 ? dist(s.km) : s.minutes != null && s.minutes > 0 ? time(Math.round(s.minutes * 60)) : { kind: "open" };
    return step(s.kind, duration, target);
  };
  return steps.map((b) => ("repeat" in b ? { kind: "repeat" as const, times: Math.round(b.repeat), steps: b.steps.map(one) } : one(b)));
}

/** Steps after expanding repeats (the limit is on what the watch has to show). */
export const stepCount = (steps: readonly CoachBlock[]): number =>
  steps.reduce((n, b) => n + ("repeat" in b ? Math.max(0, Math.round(b.repeat)) * b.steps.length : 1), 0);

/** One line the coach can read and edit: "warmup 2 km easy; 5× (run 1 km interval, recover 2 min); cooldown 1.5 km easy". */
export function describeBlocks(blocks: readonly Block[]): string {
  const one = (s: Step) => {
    const d = s.duration.kind === "distance" ? `${r1(s.duration.m / 1000)} km` : s.duration.kind === "time" ? `${r1(s.duration.s / 60)} min` : "open";
    return `${s.kind} ${d}${s.target.kind === "pace" ? ` ${s.target.zone}` : ""}`;
  };
  return blocks.map((b) => (b.kind === "repeat" ? `${b.times}× (${b.steps.map(one).join(", ")})` : one(b))).join("; ");
}
