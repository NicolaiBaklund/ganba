import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, HARD_TYPES, weekday, type ProposalChange } from "@loop/core";
import { saveTokens } from "@/lib/garmin/accounts";
import { syncGarmin } from "@/lib/garmin/sync";
import { acceptProposal, activePlan, createPlan, planWorkouts, pushToGarmin, reconcilePlan, refreshProposals } from "@/lib/training/service";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";
import { FakeGarmin, run } from "./fake-garmin";

const WEEKDAYS = [2, 4, 0]; // Tue, Thu, Sun

describe("training plan: create, push, reconcile, proposals", () => {
  let u: TestUser;
  let today: string;
  let raceDate: string;
  const garmin = new FakeGarmin();

  beforeAll(async () => {
    u = await createTestUser("plan");
    ({ today } = await seedUser(admin(), u.id, { days: 20 }));
    // Six weeks of history: three runs a week, one faster 5 km effort.
    for (let d = 42; d >= 1; d--) {
      const date = addDays(today, -d);
      const wd = weekday(date);
      if (wd === 2) garmin.activities.push(run(date, 7));
      if (wd === 4) garmin.activities.push(run(date, 5, { minutes: 24 }));
      if (wd === 0) garmin.activities.push(run(date, 12));
    }
    garmin.days = Array.from({ length: 42 }, (_, i) => ({ calendarDate: addDays(today, -i - 1), totalSteps: 9000 }));
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
    await syncGarmin(u.id, { source: garmin });
    raceDate = addDays(today, 70);
    while (weekday(raceDate) !== 6) raceDate = addDays(raceDate, 1); // a Saturday, not a running day
  });
  afterAll(cleanup);

  it("creates a 10K plan that respects running days, the long-run day and safe growth", async () => {
    await createPlan(u.id, { goal: { kind: "race", distance: "10k", raceDate }, weekdays: WEEKDAYS, longRunWeekday: 0, runsPerWeek: 3 });
    const plan = await activePlan(u.id);
    expect(plan).not.toBeNull();
    expect(Number(plan!.vdot)).toBeGreaterThan(38); // best effort: 5 km in 24 min ≈ VDOT 40
    expect(Number(plan!.start_km_per_week)).toBeGreaterThan(20);

    const ws = await planWorkouts(plan!.id);
    const race = ws.at(-1)!;
    expect(race.type).toBe("race");
    expect(race.date).toBe(raceDate);
    for (const w of ws.filter((x) => x.type !== "race")) expect(WEEKDAYS).toContain(weekday(w.date));
    for (const w of ws.filter((x) => x.type === "long")) expect(weekday(w.date)).toBe(0);
    expect(ws.every((w) => w.date >= today)).toBe(true);

    // No two hard sessions on consecutive days.
    const hardDates = new Set(ws.filter((w) => HARD_TYPES.has(w.type)).map((w) => w.date));
    for (const d of hardDates) expect(hardDates.has(addDays(d, 1))).toBe(false);

    // Full build weeks grow at most 10 %.
    const byWeek = new Map<number, { km: number; phase: string }>();
    for (const w of ws) {
      const e = byWeek.get(w.week) ?? { km: 0, phase: w.phase };
      e.km += Number(w.planned_km);
      byWeek.set(w.week, e);
    }
    const weeks = [...byWeek.entries()].sort((a, b) => a[0] - b[0]).slice(1); // first week may be partial
    for (let i = 1; i < weeks.length; i++) {
      const [, prev] = weeks[i - 1]!;
      const [, cur] = weeks[i]!;
      if (cur.phase === "taper" || prev.phase === "recovery" || cur.phase === "recovery") continue;
      expect(cur.km).toBeLessThanOrEqual(prev.km * 1.1 + 3); // + rounding of minimum session sizes
    }
    const taper = weeks.find(([, w]) => w.phase === "taper")!;
    const peak = Math.max(...weeks.map(([, w]) => w.km));
    expect(taper[1].km).toBeLessThan(peak);
  });

  it("pushes the next 14 days to Garmin and remembers the ids", async () => {
    await pushToGarmin(u.id, today, garmin);
    const plan = await activePlan(u.id);
    const ws = await planWorkouts(plan!.id);
    const due = ws.filter((w) => w.date <= addDays(today, 13));
    expect(garmin.pushed).toHaveLength(due.length);
    expect(due.every((w) => w.garmin_push_status === "pushed" && w.garmin_workout_id)).toBe(true);
    expect(ws.filter((w) => w.date > addDays(today, 13)).every((w) => w.garmin_push_status === "pending")).toBe(true);
    const json = garmin.pushed[0]!.workout as { sportType: { sportTypeKey: string }; workoutSegments: unknown[] };
    expect(json.sportType.sportTypeKey).toBe("running");
    expect(json.workoutSegments).toHaveLength(1);
  });

  it("a run on a planned day marks it done; a passed day without a run is missed", async () => {
    const plan = await activePlan(u.id);
    const ws = await planWorkouts(plan!.id);
    const [first, second] = ws;
    await admin()
      .from("activities")
      .insert({ user_id: u.id, garmin_activity_id: 99_000_001, local_date: first!.date, start_time: `${first!.date}T06:00:00Z`, type_key: "running", distance_m: 6100, duration_s: 2000 });
    await reconcilePlan(u.id, addDays(second!.date, 1));
    const after = await planWorkouts(plan!.id);
    expect(after.find((w) => w.id === first!.id)?.status).toBe("done");
    expect(after.find((w) => w.id === second!.id)?.status).toBe("missed");
  });

  it("a missed key session is proposed for a later day; accepting moves it and queues a re-push", async () => {
    const plan = await activePlan(u.id);
    const ws = await planWorkouts(plan!.id);
    // A quality session on a Tuesday, so Thursday/Sunday remain in the same week.
    const key = ws.find((w) => w.status === "planned" && weekday(w.date) === 2 && (w.type === "intervals" || w.type === "threshold" || w.type === "tempo"));
    expect(key).toBeTruthy();
    const fakeToday = addDays(key!.date, 1);
    await reconcilePlan(u.id, fakeToday);
    await refreshProposals(u.id, fakeToday);
    const { data: props } = await admin().from("plan_proposals").select("*").eq("plan_id", plan!.id).eq("kind", "missed").eq("status", "pending");
    expect(props).toHaveLength(1);
    const changes = props![0]!.changes as unknown as ProposalChange[];
    const move = changes.find((c) => c.op === "move" && c.workoutId === key!.id) as Extract<ProposalChange, { op: "move" }> | undefined;
    const dropped = changes.find((c) => c.op === "drop" && c.workoutId === key!.id);
    expect(move ?? dropped).toBeTruthy();

    expect(await acceptProposal(u.id, props![0]!.id)).toBe(true);
    const moved = (await planWorkouts(plan!.id)).find((w) => w.id === key!.id)!;
    if (move) {
      expect(moved.date).toBe(move.toDate);
      expect(moved.status).toBe("planned");
      expect(moved.garmin_push_status).toBe("pending");
    } else expect(moved.status).toBe("removed");
    expect(await acceptProposal(u.id, props![0]!.id)).toBe(false);
  });

  it("a new plan cancels the old one; its sessions are deleted from Garmin", async () => {
    const before = await activePlan(u.id);
    await createPlan(u.id, { goal: { kind: "build" }, weekdays: WEEKDAYS, longRunWeekday: 0, runsPerWeek: 3 });
    const after = await activePlan(u.id);
    expect(after!.id).not.toBe(before!.id);
    const deletedBefore = garmin.deleted.length;
    await pushToGarmin(u.id, today, garmin);
    expect(garmin.deleted.length).toBeGreaterThan(deletedBefore);
    const { data: old } = await admin().from("planned_workouts").select("garmin_workout_id").eq("plan_id", before!.id).gte("date", today);
    expect(old!.every((w) => w.garmin_workout_id == null)).toBe(true);
  });

  it("other users cannot see the plan", async () => {
    const other = await createTestUser("plan-other");
    const { data } = await other.client.from("planned_workouts").select("id");
    expect(data).toEqual([]);
    const { data: plans } = await other.client.from("training_plans").select("id");
    expect(plans).toEqual([]);
  });
});
