import type { Block, PaceZone, Paces, RaceDistance, Step, Target, WorkoutType } from "./types";

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

const SHORT_REPS: [number, number][] = [[5, 800], [6, 800], [5, 1000], [6, 1000], [5, 1200]];
const LONG_REPS: [number, number][] = [[4, 1000], [5, 1000], [4, 1200], [5, 1200], [6, 1200]];
const recoverFor = (m: number) => (m <= 400 ? 90 : m <= 800 ? 120 : m <= 1000 ? 150 : 180);

export function intervals(level: number, distance: RaceDistance, ctx: BuildContext, o: Shrink = {}): BuiltWorkout {
  const table = distance === "5k" || distance === "10k" ? SHORT_REPS : LONG_REPS;
  const [times, m] = table[Math.max(0, Math.min(table.length - 1, level))]!;
  return repeatsWorkout("intervals", Math.max(2, times - (o.cut ?? 0)), m, "interval", ctx, o);
}

/** Short and sharp, for taper weeks. */
export function sharpener(ctx: BuildContext): BuiltWorkout {
  return repeatsWorkout("intervals", 4, 400, "interval", ctx);
}

function repeatsWorkout(type: WorkoutType, times: number, m: number, zone: PaceZone, ctx: BuildContext, o: Shrink = {}): BuiltWorkout {
  const label = m >= 1000 ? `${m / 1000} km` : `${m} m`;
  return finish(
    type,
    `Intervals ${times} × ${label}`,
    [
      step("warmup", dist(o.warm ?? WARMUP_KM), targetFor("easy", ctx.paces)),
      {
        kind: "repeat",
        times,
        steps: [step("run", dist(m / 1000), targetFor(zone, ctx.paces)), step("recover", time(recoverFor(m)), { kind: "none" })],
      },
      step("cooldown", dist(o.cool ?? COOLDOWN_KM), targetFor("easy", ctx.paces)),
    ],
    ctx,
  );
}

const THRESHOLD: [number, number][] = [[3, 8], [2, 12], [3, 10], [2, 15], [4, 10]];

export function threshold(level: number, ctx: BuildContext, o: Shrink = {}): BuiltWorkout {
  const [t0, min] = THRESHOLD[Math.max(0, Math.min(THRESHOLD.length - 1, level))]!;
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
  const t = TEMPO_KM[distance];
  const km = Math.max(2, t[Math.max(0, Math.min(t.length - 1, level))]! - (o.cut ?? 0));
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

/**
 * The biggest version of a quality session (at or below `level`) that fits `budgetKm`.
 * Falls back to short warm-up/cool-down and fewer repeats for small weeks.
 */
export function qualityFor(type: QualityType, level: number, distance: RaceDistance, ctx: BuildContext, budgetKm: number): BuiltWorkout {
  const make = (l: number, o?: Shrink) =>
    type === "intervals" ? intervals(l, distance, ctx, o) : type === "threshold" ? threshold(l, ctx, o) : tempo(l, distance, ctx, o);
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
      return easyRun(km, ctx); // races are only placed by the generator
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
