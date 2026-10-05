import { describe, expect, it } from "vitest";
import { addDays, analyzeRecovery, buildRecoveryRows, recoveryCurve, type RecoveryDayInput, type RecoveryQuestion, type RecoveryResult } from "@loop/core";

const END = "2026-09-30";
const DAYS = 120;
const FROM = addDays(END, -89);

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Synth {
  seed: number;
  rho?: number;
  /** HRV next morning drops with the deficit. */
  plant?: boolean;
  /** Hard days raise the deficit and lower next morning's HRV; the deficit itself does nothing. */
  confound?: boolean;
  /** Share of days with a drink. */
  drinkShare?: number;
  /** Carbs and HRV both drift up over the period, unrelated. */
  trend?: boolean;
  /** Autocorrelation of the outcome series (sleep, HRV, resting HR, runs); default = rho. */
  rhoOut?: number;
  /** Deficit in diet phases of 2–4 weeks (cut / maintenance), unrelated to anything. */
  phases?: boolean;
}

/** 120 days of fake data: AR(1) noise per series, every day food-logged, runs on ~half the days. */
function synth(o: Synth): RecoveryDayInput[] {
  const r = prng(o.seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const ar = (rho: number) => {
    let x = gauss();
    return () => (x = rho * x + Math.sqrt(1 - rho * rho) * gauss());
  };
  const [def, carb, prot, steps] = Array.from({ length: 4 }, () => ar(o.rho ?? 0));
  const [sleepN, hrvN, rhrN, runN] = Array.from({ length: 4 }, () => ar(o.rhoOut ?? o.rho ?? 0));
  let phaseLeft = 0;
  let phase = 0;
  const days: RecoveryDayInput[] = [];
  let prev: { deficit: number; hard: boolean } | null = null;
  for (let t = 0; t < DAYS; t++) {
    const date = addDays(END, t - (DAYS - 1));
    const hard = r() < 0.25;
    if (o.phases && phaseLeft-- <= 0) {
      phase = phase > 0 ? -1 : 1;
      phaseLeft = 14 + Math.floor(r() * 15);
    }
    const deficit = o.phases ? 500 + 350 * phase + 150 * def!() : 500 + 300 * def!() + (o.confound && hard ? 700 : 0);
    const carbs = 4 + carb!() + (o.trend ? (2 * t) / DAYS : 0);
    let hrv = 60 + 6 * hrvN!() + (o.trend ? (15 * t) / DAYS : 0);
    if (prev && o.plant) hrv -= (4 * (prev.deficit - 500)) / 300;
    if (prev && o.confound && prev.hard) hrv -= 10;
    const runs = r() < 0.5;
    days.push({
      date,
      sleepScore: 78 + 6 * sleepN!(),
      hrv,
      restingHr: 50 + 3 * rhrN!(),
      food: { deficitKcal: deficit, carbsPerKg: carbs, proteinPerKg: 1.8 + 0.3 * prot!(), alcoholG: r() < (o.drinkShare ?? 0) ? 30 : 0, lateKcal: r() < 0.3 ? 500 : 0 },
      hard,
      long: t % 7 === 0,
      steps: 9000 + 3000 * steps!(),
      easyMetersPerBeat: runs && !hard ? 1.5 + 0.08 * runN!() : null,
      qualityPaceRatio: hard ? 1 + 0.03 * runN!() : null,
    });
    prev = { deficit, hard };
  }
  return days;
}

const run = (o: Synth): RecoveryResult[] => analyzeRecovery(buildRecoveryRows(synth(o), FROM, END));
const byId = (rs: RecoveryResult[], id: string) => rs.find((x) => x.questionId === id);
const seeds = Array.from({ length: 20 }, (_, i) => i + 1);

describe("recovery engine on constructed data", () => {
  it("finds a planted link with the right direction and size", () => {
    const f = byId(run({ seed: 7, plant: true }), "deficit-hrv")!;
    expect(f.kind).toBe("finding");
    expect(f.effectSd!).toBeLessThan(-0.4);
    expect(f.controlOk).toBe(true);
    expect(f.rank).toBeGreaterThanOrEqual(1);
  });

  // q ≤ 0.10 allows about 10 % of pure-noise datasets one false finding. A day-by-day shuffle gave 36/100 on
  // AR(1) noise; week blocks alone 32/100 at ρ = 0.9 and 18/100 for diet phases. 14-day blocks plus the
  // effective-days rule: 4/100 (ρ = 0.9), 14/100 (phases).
  const datasetsWithFinding = (o: Omit<Synth, "seed">, base: number) =>
    Array.from({ length: 100 }, (_, i) => base + i).filter((s) => run({ ...o, seed: s }).some((x) => x.kind === "finding")).length;

  it("pure noise: at most 15 of 100 datasets show any finding", () => {
    expect(datasetsWithFinding({}, 1000)).toBeLessThanOrEqual(15);
  });

  it("noise where neighbouring days depend on each other (AR(1), ρ = 0.6): at most 15 of 100", () => {
    expect(datasetsWithFinding({ rho: 0.6 }, 2000)).toBeLessThanOrEqual(15);
  });

  it("strongly autocorrelated noise (ρ = 0.9): at most 15 of 100", () => {
    expect(datasetsWithFinding({ rho: 0.9 }, 3000)).toBeLessThanOrEqual(15);
  });

  it("diet phases of 2–4 weeks against streaky outcomes (ρ = 0.6): at most 15 of 100", () => {
    expect(datasetsWithFinding({ phases: true, rho: 0.5, rhoOut: 0.6 }, 4000)).toBeLessThanOrEqual(15);
  });

  it("a link that only comes from hard days is stopped by the training control", () => {
    const rs = run({ seed: 12, confound: true });
    expect(byId(rs, "deficit-hrv")!.kind).toBe("needs_data");
    expect(byId(rs, "deficit-hrv")!.reason).toBe("training");
    expect(byId(rs, "hard-hrv")!.kind).toBe("finding");
    for (const seed of [11, 13]) expect(byId(run({ seed, confound: true }), "deficit-hrv")!.kind).not.toBe("finding");
  });

  it("alcohol questions stay hidden until at least 4 drink days", () => {
    expect(run({ seed: 3 }).some((x) => x.factor === "alcohol")).toBe(false);
    expect(run({ seed: 3, drinkShare: 0.25 }).filter((x) => x.factor === "alcohol")).toHaveLength(3);
  });

  it("detrending: carbs and HRV drifting up together give no finding", () => {
    expect(byId(run({ seed: 5, trend: true }), "carbs-hrv")!.kind).not.toBe("finding");
  });

  it("too few days → needs data with progress, nothing else", () => {
    const rs = analyzeRecovery(buildRecoveryRows(synth({ seed: 9 }), addDays(END, -9), END));
    expect(rs.every((x) => x.kind === "needs_data" && x.reason === "few_days")).toBe(true);
    expect(rs[0]!.groups.needed).toBe(8);
  });

  it("'no clear link' only with ≥ 20 days per group and a small effect; it does occur", () => {
    const all = seeds.slice(0, 5).flatMap((s) => run({ seed: s }));
    const none = all.filter((x) => x.kind === "no_effect");
    expect(none.length).toBeGreaterThan(0);
    for (const x of none) {
      expect(Math.min(x.groups.high.n, x.groups.low.n)).toBeGreaterThanOrEqual(20);
      expect(Math.abs(x.effectSd!)).toBeLessThan(0.2);
    }
  });

  it("same input → same answer; 21 questions with alcohol", () => {
    const a = run({ seed: 4, drinkShare: 0.25 });
    expect(a).toEqual(run({ seed: 4, drinkShare: 0.25 }));
    expect(a).toHaveLength(21);
  });

  it("threshold questions and delayed lags work (AI-proposed shapes)", () => {
    const rows = buildRecoveryRows(synth({ seed: 7, plant: true }), FROM, END);
    const qs: RecoveryQuestion[] = [
      { id: "t", factor: "deficit", transform: "threshold", threshold: 600, outcome: "hrv", lag: 1 },
      { id: "n", factor: "carbs", transform: "tertile", outcome: "sleepScore", lag: 2 },
      { id: "bad", factor: "deficit", transform: "threshold", outcome: "hrv", lag: 1 },
    ];
    const rs = analyzeRecovery(rows, qs, { maxQ: 0.05 });
    expect(byId(rs, "t")!.kind).toBe("finding");
    expect(byId(rs, "t")!.groups.high.bound).toBe(600);
    expect(byId(rs, "n")!.groups.high.n).toBeGreaterThan(0);
    expect(byId(rs, "bad")!.reason).toBe("few_days"); // no threshold → nothing to compare
  });

  it("curves: a band from each day's own history, none before 14 earlier values", () => {
    const s = new Map(Array.from({ length: 40 }, (_, i) => [addDays(END, i - 39), 50 + (i % 10)] as const));
    const pts = recoveryCurve(s, addDays(END, -39), END);
    expect(pts).toHaveLength(40);
    expect(pts[5]!.low).toBeNull();
    const last = pts.at(-1)!;
    expect(last.low).toBeGreaterThanOrEqual(50);
    expect(last.high).toBeLessThanOrEqual(59);
    expect(last.low!).toBeLessThan(last.high!);
  });
});
