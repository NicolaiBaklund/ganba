import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activityKcal,
  addDays,
  applyChanges,
  checkChanges,
  blocksFromSteps,
  generateRidePlan,
  rideContext,
  rideFitnessFrom,
  rideTestProposal,
  weekday,
  type Block,
  type ISODate,
  type PlanWorkout,
  type RidePlanInput,
  type Step,
} from "@loop/core";
import { saveTokens } from "@/lib/garmin/accounts";
import { syncGarmin } from "@/lib/garmin/sync";
import { toGarminWorkout } from "@/lib/garmin/workout-json";
import { activePlan, createPlan, planWorkouts, pushToGarmin, setRideIndoor } from "@/lib/training/service";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { FakeGarmin, run } from "./fake-garmin";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";

const MONDAY: ISODate = "2026-11-02";
const steps = (blocks: Block[]): Step[] => blocks.flatMap((b) => (b.kind === "repeat" ? b.steps : [b]));
const minutesOf = (s: number) => Math.round(s / 60);
const base = (o: Partial<RidePlanInput> = {}): RidePlanInput => ({
  goal: { kind: "event", date: addDays(MONDAY, 7 * 14 + 5), km: 150, elevationM: 1800 },
  startDate: MONDAY,
  weekdays: [2, 4, 6, 0],
  longRideWeekday: 6,
  ridesPerWeek: 4,
  lthr: 170,
  speedKmh: 27,
  startMinPerWeek: 360,
  deficitKcal: 0,
  recentLongestMin: 150,
  experienced: true,
  ...o,
});
const QUALITY = new Set(["intervals", "threshold", "tempo"]);

describe("cycling fitness", () => {
  const today: ISODate = "2026-10-22";
  const ride = (back: number, min: number, o: { indoor?: boolean; km?: number; maxHr?: number } = {}) => ({
    date: addDays(today, -back),
    distanceM: (o.km ?? (min / 60) * 27) * 1000,
    timeS: min * 60,
    indoor: o.indoor,
    maxHr: o.maxHr,
  });

  it("start time from the best recent week, LTHR from Garmin cycling, else running − 5, else max HR", () => {
    const rides = [ride(2, 90), ride(4, 60), ride(9, 180), ride(11, 120), ride(16, 120), ride(23, 60)];
    const f = rideFitnessFrom(rides, today, { lthrCycling: 172 });
    expect(f.lthr).toBe(172);
    expect(f.baseMinPerWeek).toBe(205); // best week 300 min, capped at 1.3 × the 4-week average (157.5)
    expect(rideFitnessFrom(rides, today, { lthrRunning: 183 }).lthr).toBe(178);
    expect(rideFitnessFrom([ride(3, 60, { maxHr: 190 })], today).lthr).toBe(171);
    expect(rideFitnessFrom([], today).baseMinPerWeek).toBe(180); // no rides: a careful start
  });

});

describe("cycling plans", () => {
  it("every session is time- and heart-rate-based; easy rides last an hour, recovery 45–60 min", () => {
    const p = generateRidePlan(base());
    for (const w of p.workouts.filter((x) => x.type !== "race")) {
      for (const s of steps(w.blocks)) {
        expect(s.duration.kind).toBe("time");
        expect(s.target.kind === "hr" || s.target.kind === "none").toBe(true);
      }
    }
    for (const w of p.workouts.filter((x) => x.type === "easy" && x.phase !== "taper")) {
      const m = minutesOf(w.plannedDurationS);
      if (w.title.startsWith("Recovery")) expect(m).toBeGreaterThanOrEqual(45);
      else expect(m).toBeGreaterThanOrEqual(60);
    }
  });

  it("rotation follows the profile; climbs only with hills, else climb-effort", () => {
    const titles = (o: Partial<RidePlanInput>) => generateRidePlan(base(o)).workouts.filter((w) => QUALITY.has(w.type)).map((w) => w.title);
    const flat = titles({ goal: { kind: "event", date: addDays(MONDAY, 7 * 14 + 5), km: 150, elevationM: 600 } });
    expect(flat.some((t) => t.startsWith("Tempo"))).toBe(true);
    expect(flat.some((t) => /Climb/.test(t))).toBe(false);
    expect(titles({}).some((t) => t.startsWith("Climb-effort"))).toBe(true);
    expect(titles({ hills: true }).some((t) => /^Climb \d/.test(t))).toBe(true);
  });

  it("long ride grows at most ~10 % (15–30 min) a week and carries a climbing goal on a hilly event", () => {
    const p = generateRidePlan(base());
    const longs = p.workouts.filter((w) => w.type === "long" && w.phase !== "recovery" && w.phase !== "taper").map((w) => minutesOf(w.plannedDurationS));
    for (let i = 1; i < longs.length; i++) expect(longs[i]! - longs[i - 1]!).toBeLessThanOrEqual(31);
    expect(p.workouts.some((w) => w.type === "long" && /m climbing/.test(w.title))).toBe(true);
    expect(p.workouts.at(-1)).toMatchObject({ type: "race", title: "Event day: 150 km" });
  });

  it("indoor: long rides at most 2.5 h with tempo inserts, easy rides at most 90 min, no real climbs", () => {
    const p = generateRidePlan(base({ indoor: true, hills: true, startMinPerWeek: 600 }));
    const longs = p.workouts.filter((w) => w.type === "long");
    expect(Math.max(...longs.map((w) => minutesOf(w.plannedDurationS)))).toBeLessThanOrEqual(150);
    expect(longs.some((w) => w.title.startsWith("Long indoor ride") && /tempo/.test(w.title))).toBe(true);
    expect(Math.max(...p.workouts.filter((w) => w.type === "easy").map((w) => minutesOf(w.plannedDurationS)))).toBeLessThanOrEqual(90);
    expect(p.workouts.some((w) => /^Climb \d/.test(w.title))).toBe(false);
  });

  it("build fitness: blocks, a ride test every 8 weeks, no event", () => {
    const p = generateRidePlan(base({ goal: { kind: "build" }, untilDate: addDays(MONDAY, 7 * 16 - 1) }));
    expect(p.workouts.filter((w) => w.type === "test").map((w) => w.week)).toEqual([8, 16]);
    expect(p.workouts.some((w) => w.type === "race")).toBe(false);
    expect(p.workouts.filter((w) => w.week <= 3 && QUALITY.has(w.type)).some((w) => w.title.startsWith("VO2"))).toBe(true);
  });

  it("a plan starting on a Thursday has no quality ride in its first week", () => {
    const start = addDays(MONDAY, 3);
    const p = generateRidePlan(base({ startDate: start }));
    expect(p.workouts.filter((w) => w.week === 1).some((w) => QUALITY.has(w.type))).toBe(false);
  });
});

describe("cycling: Garmin, zones, coach steps, energy", () => {
  it("rides go to Garmin as cycling workouts with heart-rate targets", () => {
    const w = generateRidePlan(base()).workouts.find((x) => x.type === "threshold")!;
    const json = toGarminWorkout(w) as { sportType: { sportTypeKey: string }; workoutSegments: { workoutSteps: Record<string, unknown>[] }[] };
    expect(json.sportType.sportTypeKey).toBe("cycling");
    const flat = JSON.stringify(json);
    expect(flat).toContain('"workoutTargetTypeKey":"heart.rate.zone"');
    expect(flat).not.toContain("pace.zone");
  });

  it("a ride test proposes new zones, and applying them re-targets upcoming rides", () => {
    const prop = rideTestProposal({ lthr: 170, ftp: null }, { date: "2026-12-26", laps: [{ timeS: 900, avgHr: 140 }, { timeS: 600, avgHr: 160 }, { timeS: 1800, avgHr: 175 }, { timeS: 600, avgHr: 130 }] })!;
    expect(prop.changes).toEqual([{ op: "rezone", lthr: 176 }]);
    const w = generateRidePlan(base()).workouts.find((x) => x.type === "threshold")!;
    const pw: PlanWorkout = { ...w, id: "w1", status: "planned" };
    const ctx = { weekdays: [2, 4, 6, 0], vdot: 40, racePaceS: null, distance: null, today: "2026-11-01", sport: "ride" as const, lthr: 170, rideSpeedKmh: 27 };
    const r = applyChanges([pw], prop.changes, ctx);
    expect(r.lthr).toBe(176);
    const z4 = steps(r.workouts[0]!.blocks).find((s) => s.target.kind === "hr" && s.target.zone === "z4")!.target as { maxBpm: number };
    expect(z4.maxBpm).toBe(Math.round(176 * 0.99));
  });

  it("the coach can move a long ride (its km is only an estimate); indoor changes keep the trainer caps", () => {
    const long = generateRidePlan(base({ startMinPerWeek: 600, recentLongestMin: 200 })).workouts.find((w) => w.type === "long" && w.plannedKm > 60)!;
    const pw: PlanWorkout = { ...long, id: "l1", status: "planned" };
    const ctx = { weekdays: [2, 4, 6, 0], vdot: 40, racePaceS: null, distance: null, today: addDays(long.date, -7), sport: "ride" as const, lthr: 170, rideSpeedKmh: 27 };
    const moved = checkChanges([pw], [{ op: "move", workoutId: "l1", toDate: addDays(long.date, 1) }], ctx, { recentLongestKm: 80 });
    expect(moved.errors).toEqual([]);
    const indoor = applyChanges([pw], [{ op: "rescale", fromDate: ctx.today, factor: 1.5 }], { ...ctx, indoor: true });
    expect(indoor.workouts[0]!.plannedDurationS / 60).toBeLessThanOrEqual(150);
    expect(indoor.workouts[0]!.title).toMatch(/^Long indoor ride/);
  });

  it("coach steps with z4 and minutes become heart-rate steps on a ride plan", () => {
    const blocks = blocksFromSteps([{ kind: "warmup", minutes: 15 }, { repeat: 3, steps: [{ kind: "run", minutes: 10, zone: "z4" }, { kind: "recover", minutes: 5 }] }], rideContext(170, 27));
    const s = steps(blocks);
    expect(s[0]!.target).toMatchObject({ kind: "hr", zone: "z2" });
    expect(s[1]!.target).toMatchObject({ kind: "hr", zone: "z4" });
    expect(s[2]!.target).toMatchObject({ kind: "hr", zone: "z1" });
  });

  it("a ride uses Garmin's calories minus resting burn; runs keep the own formula", () => {
    const day = { steps: 0, activities: [{ typeKey: "cycling", distanceM: 40000, durationS: 5400, steps: null, kcal: 1100 }] };
    expect(activityKcal(day, 80).otherKcal).toBe(980); // 1100 − 1.5 h × 80
    const met = activityKcal({ steps: 0, activities: [{ typeKey: "cycling", distanceM: 40000, durationS: 5400, steps: null }] }, 80).otherKcal;
    expect(met).toBe(720); // no Garmin calories: MET 7
  });
});

describe("cycling plan flow (service)", () => {
  let u: TestUser;
  let today: ISODate;
  const garmin = new FakeGarmin();

  beforeAll(async () => {
    u = await createTestUser("ride");
    ({ today } = await seedUser(admin(), u.id, { days: 10 }));
    for (let d = 28; d >= 1; d--) {
      const date = addDays(today, -d);
      if (weekday(date) === 2 || weekday(date) === 6) garmin.activities.push(run(date, 40, { minutes: 90, type: "cycling" }));
    }
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
    await syncGarmin(u.id, { source: garmin });
  });
  afterAll(cleanup);

  it("creates a ride plan with LTHR from Garmin, heart-rate sessions, and pushes cycling workouts", async () => {
    garmin.thresholds = { lthrRunning: 180, lthrCycling: null };
    await createPlan(u.id, { goal: { kind: "build" }, sport: "ride", ride: { goal: { kind: "build" } }, weekdays: [2, 4, 6, 0], longRunWeekday: 6, runsPerWeek: 3 }, garmin);
    const plan = await activePlan(u.id);
    expect(plan).toMatchObject({ sport: "ride", lthr: 175, indoor: false });
    const ws = await planWorkouts(plan!.id);
    expect(ws.length).toBeGreaterThan(5);
    expect(JSON.stringify(ws.map((w) => w.blocks))).toContain('"kind":"hr"');
    await pushToGarmin(u.id, today, garmin);
    expect(garmin.pushed.length).toBeGreaterThan(0);
    expect(JSON.stringify(garmin.pushed[0]!.workout)).toContain('"sportTypeKey":"cycling"');
  });

  it("switching to indoor rebuilds upcoming rides on the same dates", async () => {
    const plan = (await activePlan(u.id))!;
    const before = (await planWorkouts(plan.id)).filter((w) => w.status === "planned" && w.date >= today);
    expect(await setRideIndoor(u.id, true)).toBe(true);
    const after = (await planWorkouts(plan.id)).filter((w) => w.status === "planned" && w.date >= today);
    expect((await activePlan(u.id))!.indoor).toBe(true);
    expect(after.map((w) => w.date).sort()).toEqual(before.map((w) => w.date).sort());
    expect(after.filter((w) => w.type === "easy").every((w) => w.planned_duration_s <= 90 * 60)).toBe(true);
  });
});
