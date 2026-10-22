import { describe, expect, it } from "vitest";
import { addDays, fitnessFrom, generatePlan, testProposal, weekday, type ISODate, type PlanInput } from "@loop/core";

// A Monday, so week 1 is whole unless a test says otherwise.
const MONDAY: ISODate = "2026-11-02";
const base = (o: Partial<PlanInput> = {}): PlanInput => ({
  goal: { kind: "race", distance: "10k", raceDate: addDays(MONDAY, 7 * 14 + 5) },
  startDate: MONDAY,
  weekdays: [1, 2, 3, 5],
  longRunWeekday: 5,
  runsPerWeek: 4,
  vdot: 43,
  startKmPerWeek: 30,
  deficitKcal: 300,
  experienced: true,
  didQuality: true,
  recentLongestKm: 12,
  ...o,
});
const QUALITY = new Set(["intervals", "threshold", "tempo"]);
const family = (title: string) => title.replace(/\s.*$/, "").replace(/^(\d+K|Half|Marathon)$/, "pace");

describe("plan variety: quality families, strides, hills, first week", () => {
  it("a 10K plan rotates at least four kinds of quality session", () => {
    const p = generatePlan(base());
    const q = p.workouts.filter((w) => QUALITY.has(w.type) && (w.phase === "build" || w.phase === "peak"));
    console.log(q.map((w) => `${w.date} ${w.phase} ${w.title}`).join("\n"));
    expect(new Set(q.map((w) => family(w.title))).size).toBeGreaterThanOrEqual(4);
    expect(q.some((w) => w.title.startsWith("10K pace"))).toBe(true); // race pace in the peak
  });

  it("strides once a week except taper and race week", () => {
    const p = generatePlan(base());
    for (const wk of p.weeks.filter((w) => w.phase !== "taper")) {
      const strides = p.workouts.filter((w) => w.week === wk.week && w.type === "strides");
      expect(strides.length, `week ${wk.week}`).toBe(1);
    }
  });

  it("hills only with the hills choice", () => {
    expect(generatePlan(base()).workouts.some((w) => w.title.startsWith("Hills"))).toBe(false);
    expect(generatePlan(base({ hills: true })).workouts.some((w) => w.title.startsWith("Hills"))).toBe(true);
  });

  it("a plan starting on a Thursday has no quality session in its first week", () => {
    const start = addDays(MONDAY, 3);
    const p = generatePlan(base({ startDate: start }));
    const week1 = p.workouts.filter((w) => w.week === 1);
    expect(week1.length).toBeGreaterThan(0);
    expect(week1.some((w) => QUALITY.has(w.type))).toBe(false);
    expect(week1.every((w) => w.date >= start)).toBe(true);
  });
});

describe("plan variety: build plans", () => {
  const until = addDays(MONDAY, 7 * 16 - 1);

  it("General: speed, threshold and endurance blocks, a 5K test every 8 weeks, long runs past 16 km", () => {
    const p = generatePlan(base({ goal: { kind: "build" }, untilDate: until, startKmPerWeek: 38 }));
    const q = (week: number) => p.workouts.filter((w) => w.week === week && QUALITY.has(w.type)).map((w) => w.title);
    console.log(p.workouts.filter((w) => QUALITY.has(w.type) || w.type === "test" || w.type === "long").map((w) => `${w.week} ${w.phase} ${w.title}`).join("\n"));
    expect(q(1).concat(q(2), q(3)).some((t) => t.startsWith("Short reps"))).toBe(true); // block 1: speed
    expect(q(5).concat(q(6), q(7)).some((t) => t.startsWith("Threshold"))).toBe(true); // block 2: threshold
    expect(p.workouts.filter((w) => w.type === "test").map((w) => w.week)).toEqual([8, 16]);
    expect(Math.max(...p.workouts.filter((w) => w.type === "long").map((w) => w.plannedKm))).toBeGreaterThan(16);
    expect(p.workouts.some((w) => w.type === "race")).toBe(false);
    expect(p.workouts.some((w) => /marathon pace/.test(w.title) && w.type === "long")).toBe(true); // endurance block fast finish
  });

  it("extending a build plan does not change weeks already generated", () => {
    const short = generatePlan(base({ goal: { kind: "build" }, untilDate: addDays(MONDAY, 7 * 8 - 1) }));
    const long = generatePlan(base({ goal: { kind: "build" }, untilDate: until }));
    const key = (w: { date: string; type: string; title: string }) => `${w.date} ${w.type} ${w.title.replace(/ [\d.]+ km$/, "")}`;
    expect(long.workouts.filter((w) => w.week <= 8 && QUALITY.has(w.type)).map(key)).toEqual(short.workouts.filter((w) => QUALITY.has(w.type)).map(key));
  });

  it("10K focus: race-pace sessions in the third block, no race day", () => {
    const p = generatePlan(base({ goal: { kind: "build", focus: "10k" }, untilDate: until }));
    expect(p.workouts.some((w) => w.week >= 9 && w.week <= 11 && w.title.startsWith("10K pace"))).toBe(true);
    expect(p.workouts.some((w) => w.type === "race")).toBe(false);
  });

  it("small weeks and two runs a week still get a sensible plan", () => {
    const p = generatePlan(base({ goal: { kind: "build" }, untilDate: until, runsPerWeek: 2, weekdays: [2, 6], longRunWeekday: 6, startKmPerWeek: 10, experienced: false, didQuality: false }));
    for (const wk of p.weeks) {
      const ws = p.workouts.filter((w) => w.week === wk.week);
      expect(ws.length).toBeLessThanOrEqual(2);
      expect(ws.some((w) => w.type === "long")).toBe(true);
      for (const w of ws) expect([2, 6]).toContain(weekday(w.date));
    }
    expect(p.workouts.some((w) => w.type === "test")).toBe(false); // too small a week for an 8.5 km test
  });
});

describe("plan variety: fitness test → paces", () => {
  const run = (laps: { distanceM: number; timeS: number }[], distanceM = 8500, timeS = 2600) => ({ date: "2026-12-26", distanceM, timeS, laps });

  it("uses the 5 km lap and proposes new paces both ways", () => {
    const faster = testProposal(42, run([{ distanceM: 2000, timeS: 720 }, { distanceM: 5000, timeS: 1290 }, { distanceM: 1500, timeS: 540 }]));
    expect(faster?.changes[0]).toEqual({ op: "repace", vdot: expect.any(Number) });
    expect((faster!.changes[0] as { vdot: number }).vdot).toBeGreaterThan(44); // 21:30 5K ≈ VDOT 46
    expect(faster!.summary).toContain("Fitness test (2026-12-26)");
    const slower = testProposal(50, run([{ distanceM: 5000, timeS: 1500 }]));
    expect((slower!.changes[0] as { vdot: number }).vdot).toBe(47); // capped at 3 down
    expect(testProposal(42, run([{ distanceM: 1000, timeS: 300 }]))).toBeNull(); // no 5 km effort found
    // Garmin's 1 km auto-laps: the fastest five in a row, not the warm-up.
    const auto = [360, 355, 258, 256, 259, 257, 262, 350, 352].map((t) => ({ distanceM: 1000, timeS: t }));
    const fromAuto = testProposal(42, run(auto, 9000, 2709));
    expect(fromAuto!.summary).toContain("5 km in 21:32");
  });
});

describe("start volume", () => {
  const today: ISODate = "2026-10-22";
  // One run per day of the given km in each of the last four 7-day weeks (index 0 = the last 7 days).
  const runsFor = (weeks: number[]) =>
    weeks.flatMap((km, i) => [1, 3, 5].map((d) => ({ date: addDays(today, -(7 * i + d)), distanceM: (km / 3) * 1000, timeS: (km / 3) * 330 })));

  it("a sick week doesn't drag the start down: best week, capped at 30 % over the average", () => {
    const f = fitnessFrom(runsFor([11.6, 26.9, 39.6, 43]), today);
    expect(f.baseKmPerWeek).toBeCloseTo(39.4, 0); // best 43, cap 1.3 × 30.3
  });

  it("after a break (last two weeks nearly zero) it starts carefully", () => {
    const f = fitnessFrom(runsFor([0, 0, 40, 40]), today);
    expect(f.baseKmPerWeek).toBe(20); // the 4-week average, not 26
  });

  it("week 1 matches the start volume; older plans keep their week-1 growth", () => {
    const input = { goal: { kind: "build" as const }, startDate: MONDAY, weekdays: [1, 3, 5, 0], longRunWeekday: 0, runsPerWeek: 4, vdot: 43, startKmPerWeek: 40, deficitKcal: 0, experienced: true, recentLongestKm: 16 };
    // Session sizes round and have floors/caps, so the week lands near (not exactly on) its target.
    const matched = generatePlan(input).weeks[0]!.km;
    const grown = generatePlan({ ...input, week1Grows: true }).weeks[0]!.km;
    expect(Math.abs(matched - 40)).toBeLessThan(2.5);
    expect(grown).toBeGreaterThan(matched + 1.5);
  });
});
