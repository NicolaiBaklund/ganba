import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, metFor, weekday } from "@loop/core";
import { dayActivity } from "@/lib/db/activity";
import { refreshStamps } from "@/lib/health/stamps";
import { linkStrength } from "@/lib/strength/link";
import { finishSession, openSession, saveExercise, setFavourite } from "@/lib/strength/sessions";
import { loadSession, strengthItems, strengthProgress } from "@/lib/strength/view";
import { activePlan, setStrengthDays } from "@/lib/training/service";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";

const sets = (n: number, reps: number, kg: number | null) => Array.from({ length: n }, (_, i) => ({ setNo: i + 1, reps, kg, seconds: null }));

describe("strength (spec 2026-11-10)", () => {
  let u: TestUser;
  let today: string;
  const strengthAct = async (date: string, hour: number, kcal: number) =>
    (
      await admin()
        .from("activities")
        .insert({ user_id: u.id, source: "garmin", local_date: date, start_time: `${date}T${String(hour).padStart(2, "0")}:00:00Z`, type_key: "strength_training", duration_s: 3000, garmin_kcal: kcal } as never)
        .select("id")
        .single()
    ).data!.id as string;

  beforeAll(async () => {
    u = await createTestUser("strength");
    ({ today } = await seedUser(admin(), u.id, { days: 3 }));
  });
  afterAll(cleanup);

  it("one session per day; sets start from last time; the increase hint uses the runner's own step", async () => {
    const d1 = addDays(today, -20), d2 = addDays(today, -13), d3 = addDays(today, -6);
    const s1 = await openSession(u.id, d1);
    expect(await openSession(u.id, d1)).toBe(s1);
    await expect(openSession(u.id, addDays(today, 1))).rejects.toThrow();
    await saveExercise(u.id, s1, { key: "shoulder-press", position: 0, sets: sets(3, 10, 18) });
    const s2 = await openSession(u.id, d2);
    await saveExercise(u.id, s2, { key: "shoulder-press", position: 0, sets: sets(3, 10, 20) });
    await saveExercise(u.id, s2, { key: "bench-press", position: 1, sets: [...sets(2, 8, 60), { setNo: 3, reps: 6, kg: 60, seconds: null }] });
    const s3 = await openSession(u.id, d3);

    const v = (await loadSession(u.id, s3))!;
    const press = v.catalog.find((r) => r.key === "shoulder-press")!;
    expect(press.prefill).toEqual(sets(3, 10, 20));
    // Went 18 → 20 last time: suggest +2 again. Bench missed reps in the last set: no hint.
    expect(press.hint).toEqual({ kg: 2 });
    expect(v.catalog.find((r) => r.key === "bench-press")!.hint).toBeNull();
    // Never logged: 3 × 10, no load; barbell default step only once there is a full session.
    expect(v.catalog.find((r) => r.key === "squat")!.prefill).toEqual(sets(3, 10, null));
    expect(v.catalog.find((r) => r.key === "pull-ups")!.hint).toBeNull();
  });

  it("a session without a watch counts its own kcal; once linked to Garmin only Garmin's", async () => {
    const date = addDays(today, -1);
    const s = await openSession(u.id, date);
    await saveExercise(u.id, s, { key: "bench-press", position: 0, sets: sets(4, 8, 62) });
    const kg = 80;
    const own = await dayActivity(admin(), u.id, date, today, kg);
    // 4 sets → the 20 min minimum: MET (net) × hours × kg.
    expect(own.otherKcal).toBe(Math.round((20 / 60) * (metFor("strength_training") - 1) * kg));

    // Two Garmin strength activities that day: the one nearest the logging links, the other stays "from your watch".
    const far = await strengthAct(date, 1, 250);
    const near = await strengthAct(date, new Date().getUTCHours(), 300);
    await linkStrength(u.id);
    const { data: row } = await admin().from("strength_sessions").select("activity_id").eq("id", s).single();
    expect(row!.activity_id).toBe(near);
    const linked = await dayActivity(admin(), u.id, date, today, kg);
    // Garmin kcal minus resting burn, for both activities; the session itself no longer counts.
    const net = (k: number) => k - (3000 / 3600) * kg;
    expect(linked.otherKcal).toBe(Math.round(net(300) + net(250)));
    const items = await strengthItems(u.id, date, date, today, null);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ state: "done", sessionId: s, groups: ["chest"], minutes: 50 });
    expect(far).toBeTruthy();
  });

  it("This week: logged, from the watch, planned and missed strength days, one per day", async () => {
    const from = addDays(today, -6), to = addDays(today, 6);
    const watchDay = addDays(today, -4);
    const watch = await strengthAct(watchDay, 8, 280);
    const plan = { strength_weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: addDays(today, -30), generated_until: addDays(today, 3) };
    const items = await strengthItems(u.id, from, to, today, plan);
    const byDate = new Map(items.map((i) => [i.date, i]));
    // Opened but nothing saved (the first test's third session) is not a done day.
    expect(byDate.get(addDays(today, -6))).toMatchObject({ state: "missed", sessionId: null });
    expect(byDate.get(addDays(today, -1))).toMatchObject({ state: "done", fromWatch: false });
    expect(byDate.get(watchDay)).toMatchObject({ state: "done", fromWatch: true, activityId: watch });
    expect(byDate.get(addDays(today, -2))).toMatchObject({ state: "missed" });
    expect(byDate.get(today)).toMatchObject({ state: "planned" });
    expect(byDate.has(addDays(today, 4))).toBe(false); // after the plan's end
    const onlyMon = await strengthItems(u.id, from, to, today, { ...plan, strength_weekdays: [1] });
    expect(onlyMon.filter((i) => i.state !== "done").every((i) => weekday(i.date) === 1)).toBe(true);
  });

  it("Progress rows for favourites and stamps for sessions and round numbers", async () => {
    await setFavourite(u.id, "shoulder-press", true);
    await setFavourite(u.id, "bench-press", true);
    const p = (await strengthProgress(u.id, today))!;
    expect(p.sessions).toBe(3);
    const press = p.rows.find((r) => r.key === "shoulder-press")!;
    expect(press).toMatchObject({ unit: "kg", from: 18, to: 20 });
    expect(p.rows.find((r) => r.key === "bench-press")).toMatchObject({ from: 60, to: 62 });

    const s = await openSession(u.id, today);
    await saveExercise(u.id, s, { key: "bench-press", position: 0, sets: sets(3, 5, 70) });
    expect(await finishSession(u.id, s)).toBe("finished");
    await refreshStamps(u.id, today);
    const { data: stamps } = await admin().from("stamps").select("kind, key, value").eq("user_id", u.id).like("kind", "strength%");
    const keys = (stamps ?? []).map((x) => `${x.kind}:${x.key}`);
    expect(keys).toEqual(expect.arrayContaining(["strength_count:1", "strength_pr:bench-press-70"]));
    // 18 → 20 kg passes 20; the first session (18) is the baseline and gives no "10 kg" stamp.
    expect(keys).toContain("strength_pr:shoulder-press-20");
    expect(keys).not.toContain("strength_pr:shoulder-press-10");
    expect((stamps ?? []).find((x) => x.key === "bench-press-70")!.value).toMatchObject({ name: "Bench press", kg: 70 });

    // An empty session is removed on Finish.
    const empty = await openSession(u.id, addDays(today, -2));
    expect(await finishSession(u.id, empty)).toBe("removed");
  });

  it("strength days in the plan: stored on the plan, no planned_workouts rows, shown as planned and done when logged", async () => {
    const { data: plan } = await admin()
      .from("training_plans")
      .insert({ user_id: u.id, goal_kind: "build", distance_km: 10, start_date: addDays(today, -7), generated_until: addDays(today, 30), weekdays: [2, 4, 6], long_run_weekday: 6, runs_per_week: 3, vdot: 45, start_km_per_week: 25 } as never)
      .select("id")
      .single();
    const before = (await admin().from("planned_workouts").select("id", { count: "exact", head: true }).eq("plan_id", plan!.id)).count;
    const tomorrow = addDays(today, 1);
    expect(await setStrengthDays(u.id, [weekday(tomorrow), weekday(tomorrow), 9])).toBe(true);
    const p = (await activePlan(u.id))!;
    expect(p.strength_weekdays).toEqual([weekday(tomorrow)]);
    expect((await admin().from("planned_workouts").select("id", { count: "exact", head: true }).eq("plan_id", plan!.id)).count).toBe(before);
    expect((await strengthItems(u.id, tomorrow, tomorrow, today, p))[0]).toMatchObject({ state: "planned", sessionId: null });
    // Today was logged in an earlier test: done, whatever the plan says.
    await setStrengthDays(u.id, [weekday(today)]);
    expect((await strengthItems(u.id, today, today, today, (await activePlan(u.id))!))[0]).toMatchObject({ state: "done" });
  });
});
