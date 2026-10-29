import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, localDate } from "@loop/core";
import { saveTokens } from "@/lib/garmin/accounts";
import { syncGarmin } from "@/lib/garmin/sync";
import { buildCoachContext } from "@/lib/coach/context";
import { readTools } from "@/lib/coach/tools";
import { activeThread } from "@/lib/coach/store";
import { modeOf } from "@/lib/db/mode";
import { loadWeekStrip } from "@/lib/db/week";
import { activePlan, createPlan, currentFitness, logManualRun, planWorkouts, previewPlan, undoManualRun } from "@/lib/training/service";
import { loadTrainingView, todaysWorkout } from "@/lib/training/view";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";
import { FakeGarmin } from "./fake-garmin";

/** Training only (spec 2026-10-29): no body or food data, no Garmin, runs logged by hand. */
describe("Training only: a plan without Garmin or food", () => {
  let u: TestUser;
  const tz = "Europe/Oslo";
  const today = localDate(tz);
  const allDays = [0, 1, 2, 3, 4, 5, 6];

  beforeAll(async () => {
    u = await createTestUser("training-only");
    // What "Training only" in onboarding stores: no sex, birth date or height.
    const { error } = await u.client.from("profiles").insert({ user_id: u.id, timezone: tz, mode: "training", onboarded_at: new Date().toISOString() });
    expect(error).toBeNull();
  });
  afterAll(cleanup);

  it("the profile has no body data and is Training only", async () => {
    expect(await modeOf(u.id)).toBe("training");
    const { data } = await admin().from("profiles").select("sex, birth_date, height_cm").eq("user_id", u.id).single();
    expect(data).toEqual({ sex: null, birth_date: null, height_cm: null });
  });

  it("the stated volume is the start when no runs are logged", async () => {
    const input = { goal: { kind: "build" as const }, weekdays: allDays, longRunWeekday: 0, runsPerWeek: 4, start: { kmPerWeek: 32, longestKm: 12 } };
    const p = await previewPlan(u.id, input);
    expect(p.fitness.baseKmPerWeek).toBe(32);
    expect(p.fitness.longestKm).toBe(12);
    expect(p.fitness.source).toEqual({ kind: "stated" });
    await createPlan(u.id, input);
    const plan = (await activePlan(u.id))!;
    expect(Number(plan.start_km_per_week)).toBe(32);
  });

  it("today's session and the week show without Garmin", async () => {
    const v = await loadTrainingView(u.id);
    expect(v.plan).not.toBeNull();
    expect(v.thisWeek?.workouts.length).toBeGreaterThan(0);
    const t = await todaysWorkout(u.id, today);
    expect(t.plan).toBe(true);
  });

  it("Done logs the run by hand and the session is done; Undo opens it again", async () => {
    const plan = (await activePlan(u.id))!;
    const ws = await planWorkouts(plan.id);
    const s = ws.find((w) => w.status === "planned" && w.date >= today)!;
    // Move it to today so it can be logged (a session ahead can't).
    await admin().from("planned_workouts").update({ date: today }).eq("id", s.id);
    const ahead = ws.find((w) => w.status === "planned" && w.date > addDays(today, 1) && w.id !== s.id)!;
    expect(await logManualRun(u.id, ahead.id, { km: 5, timeS: null })).toEqual({ ok: false, error: "not_open" });

    expect(await logManualRun(u.id, s.id, { km: 6.2, timeS: 1980 })).toEqual({ ok: true });
    const done = (await planWorkouts(plan.id)).find((w) => w.id === s.id)!;
    expect(done.status).toBe("done");
    const { data: a } = await admin().from("activities").select("source, distance_m, moving_s, type_key, garmin_activity_id").eq("id", done.activity_id!).single();
    expect(a).toEqual({ source: "manual", distance_m: 6200, moving_s: 1980, type_key: "running", garmin_activity_id: null });
    expect((await todaysWorkout(u.id, today)).workout).toMatchObject({ status: "done", manual: true, actualKm: 6.2 });
    const strip = await loadWeekStrip(admin(), u.id, today);
    expect(strip.find((d) => d.date === today)!.sessions.some((x) => x.state === "done")).toBe(true);

    expect(await undoManualRun(u.id, s.id)).toEqual({ ok: true });
    const back = (await planWorkouts(plan.id)).find((w) => w.id === s.id)!;
    expect(back).toMatchObject({ status: "planned", activity_id: null });
    expect((await admin().from("activities").select("id").eq("user_id", u.id)).data).toEqual([]);
  });

  it("two Done taps at once log one run", async () => {
    const plan = (await activePlan(u.id))!;
    const s = (await planWorkouts(plan.id)).find((w) => w.date === today)!;
    const rs = await Promise.all([logManualRun(u.id, s.id, { km: 5, timeS: null }), logManualRun(u.id, s.id, { km: 5, timeS: null })]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect((await admin().from("activities").select("id").eq("user_id", u.id)).data).toHaveLength(1);
    expect(await undoManualRun(u.id, s.id)).toEqual({ ok: true });
  });

  it("a run logged without a time counts for the volume", async () => {
    const plan = (await activePlan(u.id))!;
    const s = (await planWorkouts(plan.id)).find((w) => w.status === "planned")!;
    const yesterday = addDays(today, -1);
    await admin().from("planned_workouts").update({ date: yesterday }).eq("id", s.id);
    expect(await logManualRun(u.id, s.id, { km: 8, timeS: null })).toEqual({ ok: true });
    const fit = await currentFitness(u.id, today);
    expect(fit.runCount).toBe(1);
    expect(fit.longestKm).toBe(8);
    expect(await undoManualRun(u.id, s.id)).toEqual({ ok: true });
    await admin().from("planned_workouts").update({ date: today, status: "planned" }).eq("id", s.id);
  });

  it("the plan is kept up to date once a day without Garmin", async () => {
    await loadTrainingView(u.id);
    const plan = (await activePlan(u.id))!;
    expect(plan.upkept_on).toBe(today);
  });

  it("a session done with Garmin's run can't be undone here", async () => {
    const plan = (await activePlan(u.id))!;
    const s = (await planWorkouts(plan.id)).find((w) => w.date === today)!;
    const { data: a } = await admin()
      .from("activities")
      .insert({ user_id: u.id, garmin_activity_id: 4242, local_date: today, start_time: `${today}T07:00:00Z`, type_key: "running", distance_m: 5000 })
      .select("id")
      .single();
    await admin().from("planned_workouts").update({ status: "done", activity_id: a!.id }).eq("id", s.id);
    expect(await undoManualRun(u.id, s.id)).toEqual({ ok: false, error: "not_manual" });
    await admin().from("planned_workouts").update({ status: "planned", activity_id: null }).eq("id", s.id);
    await admin().from("activities").delete().eq("id", a!.id);
  });

  it("the coach has no food or weight tools and knows it's training only", async () => {
    const thread = await activeThread(u.id);
    const cc = await buildCoachContext(u.id, thread.id, { message: "How is my week?" });
    expect(cc.training).toBe(true);
    expect(cc.text).toContain("training only");
    expect(cc.text).not.toContain("Today's intake");
    const names = readTools(cc).map((t) => t.name);
    expect(names).not.toContain("food_log");
    expect(names).not.toContain("weight");
    expect(names).toContain("activities");
  });

  it("a Garmin sync never removes runs logged by hand", async () => {
    const plan = (await activePlan(u.id))!;
    const s = (await planWorkouts(plan.id)).find((w) => w.date === today)!;
    await logManualRun(u.id, s.id, { km: 4, timeS: null });
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
    const out = await syncGarmin(u.id, { source: new FakeGarmin() });
    expect(out.status).toBe("ok");
    const { data } = await admin().from("activities").select("source").eq("user_id", u.id);
    expect(data).toEqual([{ source: "manual" }]);
  });
});
