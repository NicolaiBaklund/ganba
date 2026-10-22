import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addDays,
  applyChanges,
  checkChanges,
  crossSessions,
  ftpFrom,
  generatePlan,
  generateRidePlan,
  pacesFor,
  retargetRide,
  rideContext,
  rideTestProposal,
  weekday,
  type Block,
  type ISODate,
  type PlanContext,
  type PlanWorkout,
  type RidePlanInput,
  type Step,
} from "@loop/core";
import { saveTokens } from "@/lib/garmin/accounts";
import { syncGarmin } from "@/lib/garmin/sync";
import { toGarminWorkout } from "@/lib/garmin/workout-json";
import { activePlan, createPlan, planWorkouts, pushToGarmin, reconcilePlan, setCrossDays, setRideIndoor, setRidePower } from "@/lib/training/service";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { FakeGarmin, run } from "./fake-garmin";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";

const MONDAY: ISODate = "2026-11-02";
const steps = (blocks: Block[]): Step[] => blocks.flatMap((b) => (b.kind === "repeat" ? b.steps : [b]));
const durations = (blocks: Block[]) => JSON.stringify(blocks, (k, v) => (k === "target" ? undefined : v));
const ride = (o: Partial<RidePlanInput> = {}): RidePlanInput => ({
  goal: { kind: "build" },
  startDate: MONDAY,
  weekdays: [2, 4, 6, 0],
  longRideWeekday: 6,
  ridesPerWeek: 4,
  lthr: 170,
  speedKmh: 27,
  startMinPerWeek: 360,
  deficitKcal: 0,
  untilDate: addDays(MONDAY, 7 * 8 - 1),
  ...o,
});

describe("power: FTP, targets, Garmin, test", () => {
  const today: ISODate = "2026-10-23";

  it("FTP from Garmin when fresh, else from the best 20/60 min on recent rides, else unknown", () => {
    const rides = [{ date: addDays(today, -5), distanceM: 50_000, timeS: 6000, best20W: 260, best60W: 240 }];
    expect(ftpFrom(rides, today, { ftp: 250, ftpDate: addDays(today, -30) })).toEqual({ ftp: 250, source: "garmin" });
    expect(ftpFrom(rides, today, { ftp: 261, ftpDate: "2024-05-07" })).toEqual({ ftp: 247, source: "rides" }); // 0.95 × 260
    expect(ftpFrom([], today, { ftp: 261, ftpDate: "2024-05-07" })).toEqual({ ftp: null, source: null });
  });

  it("with FTP every zone step targets watts, and goes to Garmin as power.zone", () => {
    const p = generateRidePlan(ride({ ftp: 250 }));
    const zoneSteps = p.workouts.flatMap((w) => steps(w.blocks)).filter((s) => s.target.kind !== "none");
    expect(zoneSteps.length).toBeGreaterThan(10);
    expect(zoneSteps.every((s) => s.target.kind === "power")).toBe(true);
    const ss = zoneSteps.find((s) => s.target.kind === "power" && s.target.zone === "ss")!.target;
    expect(ss).toMatchObject({ minW: 220, maxW: 235 }); // 88–94 % of 250
    const json = JSON.stringify(toGarminWorkout(p.workouts.find((w) => w.type !== "easy" && w.type !== "long")!));
    expect(json).toContain('"workoutTargetTypeKey":"power.zone"');
    expect(json).not.toContain("heart.rate.zone");
  });

  it("switching power off keeps every ride's structure and times; only the targets change", () => {
    const p = generateRidePlan(ride({ ftp: 250 }));
    for (const w of p.workouts) {
      const hr = retargetRide(w.blocks, rideContext(170, 27));
      expect(durations(hr)).toBe(durations(w.blocks));
      expect(steps(hr).some((s) => s.target.kind === "power")).toBe(false);
    }
  });

  it("a ride test with power proposes FTP and LTHR; applying sets both", () => {
    const laps = [{ timeS: 900, avgHr: 140, avgPower: 180 }, { timeS: 1800, avgHr: 175, avgPower: 262 }, { timeS: 600, avgHr: 130, avgPower: 120 }];
    const prop = rideTestProposal({ lthr: 170, ftp: 240 }, { date: "2026-12-26", laps })!;
    expect(prop.changes).toEqual([{ op: "rezone", lthr: 176, ftp: 262 }]);
    expect(prop.summary).toContain("FTP 262 W");
    // FTP within 3 % and the same LTHR: nothing to propose.
    expect(rideTestProposal({ lthr: 176, ftp: 258 }, { date: "2026-12-26", laps })).toBeNull();
    const w = generateRidePlan(ride({ ftp: 240 })).workouts.find((x) => x.type === "threshold")!;
    const ctx: PlanContext = { weekdays: [2, 4, 6, 0], vdot: 40, racePaceS: null, distance: null, today: MONDAY, sport: "ride", lthr: 170, ftp: 240, power: true, rideSpeedKmh: 27 };
    const r = applyChanges([{ ...w, id: "w1", status: "planned" }], prop.changes, ctx);
    expect(r).toMatchObject({ lthr: 176, ftp: 262 });
    const z4 = steps(r.workouts[0]!.blocks).find((s) => s.target.kind === "power" && s.target.zone === "z4")!.target as { maxW: number };
    expect(z4.maxW).toBe(Math.round(262 * 1.05));
  });
});

describe("cross-training", () => {
  const raceDate = addDays(MONDAY, 7 * 12 - 1); // a Sunday
  const runPlan = () =>
    generatePlan({ goal: { kind: "race", distance: "10k", raceDate }, startDate: MONDAY, weekdays: [1, 3, 5, 0], longRunWeekday: 0, runsPerWeek: 4, vdot: 45, startKmPerWeek: 35, deficitKcal: 0 });

  it("easy rides on their own days, growing 60 → 90 min, shorter in light weeks, none the day before the race", () => {
    const main = runPlan();
    const rides = crossSessions(main.weeks, { sport: "ride", weekdays: [2, 6], startDate: MONDAY, eventDate: raceDate, ride: { ctx: rideContext(170, 27) } });
    expect(rides.every((w) => w.sport === "ride" && w.type === "easy" && [2, 6].includes(weekday(w.date)))).toBe(true);
    expect(rides.some((w) => w.date >= addDays(raceDate, -1))).toBe(false);
    expect(rides[0]!.plannedDurationS).toBe(60 * 60);
    expect(Math.max(...rides.map((w) => w.plannedDurationS))).toBeLessThanOrEqual(90 * 60);
    const light = rides.filter((w) => w.phase === "recovery" || w.phase === "taper");
    const full = rides.filter((w) => w.phase !== "recovery" && w.phase !== "taper");
    expect(light.length).toBeGreaterThan(0);
    expect(Math.max(...light.map((w) => w.plannedDurationS))).toBeLessThan(Math.max(...full.map((w) => w.plannedDurationS)));
    // Rides target heart rate and go to Garmin as cycling.
    expect(JSON.stringify(toGarminWorkout(rides[0]!))).toContain('"sportTypeKey":"cycling"');
  });

  it("easy runs in a cycling plan: 5 → 8 km at easy pace", () => {
    const main = generateRidePlan(ride());
    const runs = crossSessions(main.weeks, { sport: "run", weekdays: [1], startDate: MONDAY, run: { ctx: { paces: pacesFor(45) } } });
    expect(runs.every((w) => w.sport === "run" && w.type === "easy")).toBe(true);
    expect(runs[0]!.plannedKm).toBe(5);
    expect(Math.max(...runs.map((w) => w.plannedKm))).toBeLessThanOrEqual(8);
  });

  it("the coach can add and resize a cross ride; volume changes and weekly km stay on the main sport", () => {
    const main = runPlan();
    const rides = crossSessions(main.weeks, { sport: "ride", weekdays: [2], startDate: MONDAY, eventDate: raceDate, ride: { ctx: rideContext(170, 27) } });
    const all: PlanWorkout[] = [...main.workouts, ...rides].map((w, i) => ({ ...w, id: `w${i}`, status: "planned" }));
    const ctx: PlanContext = { weekdays: [1, 3, 5, 0], crossWeekdays: [2], vdot: 45, racePaceS: 270, distance: "10k", today: MONDAY, sport: "run", lthr: 170, rideSpeedKmh: 27 };
    const thursday = addDays(MONDAY, 10);
    const add = checkChanges(all, [{ op: "add", date: thursday, type: "easy", sport: "ride", steps: [{ kind: "run", minutes: 75, zone: "z2" }] }], ctx, { recentLongestKm: 14 });
    expect(add.errors).toEqual([]);
    const added = add.after.find((w) => w.id.startsWith("new:"))!;
    expect(added).toMatchObject({ sport: "ride", plannedDurationS: 75 * 60 });
    expect(steps(added.blocks)[0]!.target).toMatchObject({ kind: "hr", zone: "z2" });
    // Weekly km is the running km: an added ride doesn't count as a volume jump.
    expect(add.weeks[0]!.after).toBe(add.weeks[0]!.before);
    // A long cross ride is fine for a ride (minutes), though its km estimate is far over a run's limit.
    const crossRide = all.find((w) => w.sport === "ride")!;
    const replace = checkChanges(all, [{ op: "replace", workoutId: crossRide.id, type: "long", km: 70 }], ctx, { recentLongestKm: 14 });
    expect(replace.errors).toEqual([]);
    const rescaled = applyChanges(all, [{ op: "rescale", fromDate: MONDAY, factor: 0.8 }], ctx);
    expect(rides.length).toBeGreaterThan(0);
    expect(all.filter((w) => w.sport === "ride").every((w) => !rescaled.changedIds.has(w.id))).toBe(true);
    expect(all.filter((w) => w.sport === "run" && w.type === "easy").some((w) => rescaled.changedIds.has(w.id))).toBe(true);
  });
});

describe("power and cross-training (service)", () => {
  let u: TestUser;
  let today: ISODate;
  const garmin = new FakeGarmin();
  const crossDay = (t: ISODate) => [0, 1, 2, 3, 4, 5, 6].find((d) => ![1, 3, 5, 0].includes(d) && d !== weekday(t))!;

  beforeAll(async () => {
    u = await createTestUser("cross");
    ({ today } = await seedUser(admin(), u.id, { days: 10 }));
    for (let d = 28; d >= 1; d--) {
      const date = addDays(today, -d);
      if (weekday(date) === 2) garmin.activities.push(run(date, 40, { minutes: 90, type: "cycling", extra: { avgPower: 190, maxAvgPower_1200: 250, maxAvgPower_3600: 225 } }));
      if ([1, 3, 5, 0].includes(weekday(date))) garmin.activities.push(run(date, 8));
    }
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
    await syncGarmin(u.id, { source: garmin });
  });
  afterAll(cleanup);

  it("a running plan with rides on a cross day: rides on that day, FTP from rides, power on, cycling pushes", async () => {
    garmin.thresholds = { lthrRunning: 180, lthrCycling: null, ftp: null, ftpDate: null };
    const day = crossDay(today);
    await createPlan(u.id, { goal: { kind: "build" }, weekdays: [1, 3, 5, 0], longRunWeekday: 0, runsPerWeek: 4, crossWeekdays: [day] }, garmin);
    const plan = (await activePlan(u.id))!;
    expect(plan).toMatchObject({ sport: "run", cross_weekdays: [day], lthr: 175, ftp: 238, power: true }); // 0.95 × 250
    const ws = await planWorkouts(plan.id);
    const rides = ws.filter((w) => w.sport === "ride");
    expect(rides.length).toBeGreaterThan(1);
    expect(rides.every((w) => weekday(w.date) === day && w.type === "easy")).toBe(true);
    expect(JSON.stringify(rides[0]!.blocks)).toContain('"kind":"power"');
    expect(ws.filter((w) => w.sport === "run").length).toBeGreaterThan(rides.length);
    await pushToGarmin(u.id, today, garmin);
    const pushed = garmin.pushed.map((p) => JSON.stringify(p.workout));
    expect(pushed.some((j) => j.includes('"sportTypeKey":"cycling"'))).toBe(true);
    expect(pushed.some((j) => j.includes('"sportTypeKey":"running"'))).toBe(true);
  });

  it("a ride matches the ride session of its day, not a run", async () => {
    const plan = (await activePlan(u.id))!;
    const crossRide = (await planWorkouts(plan.id)).find((w) => w.sport === "ride")!;
    // Today: a run and a ride; the ride session takes the ride.
    await admin().from("planned_workouts").update({ date: today }).eq("id", crossRide.id);
    garmin.activities.push(run(today, 9), run(today, 30, { minutes: 60, type: "cycling" }));
    await syncGarmin(u.id, { source: garmin });
    await reconcilePlan(u.id, today);
    const after = (await planWorkouts(plan.id)).find((w) => w.id === crossRide.id)!;
    expect(after.status).toBe("done");
    const { data: act } = await admin().from("activities").select("type_key").eq("id", after.activity_id!).single();
    expect(act!.type_key).toBe("cycling");
  });

  it("power off keeps the rides, heart-rate targets; new cross days move the rides; indoor caps them", async () => {
    const plan = (await activePlan(u.id))!;
    const ridesBefore = (await planWorkouts(plan.id)).filter((w) => w.sport === "ride" && w.status === "planned" && w.date >= today);
    expect(await setRidePower(u.id, false)).toBe(true);
    const ridesOff = (await planWorkouts(plan.id)).filter((w) => w.sport === "ride" && w.status === "planned" && w.date >= today);
    expect(ridesOff.map((w) => w.id).sort()).toEqual(ridesBefore.map((w) => w.id).sort());
    expect(JSON.stringify(ridesOff.map((w) => w.blocks))).not.toContain('"kind":"power"');

    const runsBefore = (await planWorkouts(plan.id)).filter((w) => w.sport === "run" && w.status === "planned").map((w) => w.id).sort();
    const days = [2, 4].filter((d) => ![1, 3, 5, 0].includes(d));
    expect(await setCrossDays(u.id, days)).toBe(true);
    const ws = await planWorkouts(plan.id);
    const upcomingRides = ws.filter((w) => w.sport === "ride" && w.status === "planned" && w.date >= today);
    expect(upcomingRides.every((w) => days.includes(weekday(w.date)))).toBe(true);
    // The running sessions are untouched.
    expect(ws.filter((w) => w.sport === "run" && w.status === "planned").map((w) => w.id).sort()).toEqual(runsBefore);
    expect((await activePlan(u.id))!.cross_weekdays).toEqual(days);

    expect(await setRideIndoor(u.id, true)).toBe(true);
    const indoor = (await planWorkouts(plan.id)).filter((w) => w.sport === "ride" && w.status === "planned" && w.date >= today);
    expect(indoor.length).toBe(upcomingRides.length);
    expect(indoor.every((w) => w.planned_duration_s <= 90 * 60)).toBe(true);

    expect(await setCrossDays(u.id, [])).toBe(true);
    expect((await planWorkouts(plan.id)).filter((w) => w.sport === "ride" && w.status === "planned" && w.date >= today)).toEqual([]);
  });

  it("a cycling plan with easy runs on a cross day", async () => {
    const day = crossDay(today);
    await createPlan(
      u.id,
      { goal: { kind: "build" }, sport: "ride", ride: { goal: { kind: "build" } }, weekdays: [1, 3, 5, 0], longRunWeekday: 0, runsPerWeek: 3, crossWeekdays: [day], power: false },
      garmin,
    );
    const plan = (await activePlan(u.id))!;
    expect(plan).toMatchObject({ sport: "ride", power: false, ftp: 238 });
    const ws = await planWorkouts(plan.id);
    const runs = ws.filter((w) => w.sport === "run");
    expect(runs.length).toBeGreaterThan(1);
    expect(runs.every((w) => weekday(w.date) === day && w.type === "easy" && Number(w.planned_km) >= 5)).toBe(true);
    expect(JSON.stringify(ws.filter((w) => w.sport === "ride").map((w) => w.blocks))).toContain('"kind":"hr"');
  });
});
