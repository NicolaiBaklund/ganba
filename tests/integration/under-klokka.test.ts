import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, lastSunday, weekStartOn, zonedTime } from "@loop/core";
import { decideChallenges, ensureChallenge } from "@/lib/health/challenge";
import { saveTokens } from "@/lib/garmin/accounts";
import { loadSpot } from "@/lib/health/spot";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";

const pace = (zone: string, min: number, max: number) => ({ kind: "pace", zone, minSecPerKm: min, maxSecPerKm: max });
const easyT = pace("easy", 316, 350);
const step = (kind: string, duration: object, target: object) => ({ kind, duration, target });
const THRESHOLD = [
  step("warmup", { kind: "distance", m: 3000 }, easyT),
  { kind: "repeat", times: 2, steps: [step("run", { kind: "time", s: 720 }, pace("threshold", 269, 279)), step("recover", { kind: "time", s: 90 }, { kind: "none" })] },
  step("cooldown", { kind: "distance", m: 1500 }, easyT),
];
const EASY = [step("run", { kind: "distance", m: 12000 }, easyT)];
/** A lap as Garmin sends it; `step` marks a workout lap. */
const lap = (m: number, s: number, hr: number, step?: number, intensity = "ACTIVE") => ({ distance: m, duration: s, movingDuration: s, averageHR: hr, ...(step != null ? { wktStepIndex: step, intensityType: intensity } : {}) });

describe("under the clock (spec 2026-11-18)", () => {
  let u: TestUser;
  let today: string;
  let planId: string;

  const act = async (date: string, o: { km: number; secPerKm: number; hr: number; laps?: object[]; type?: string; hour?: number }) =>
    (
      await admin()
        .from("activities")
        .insert({
          user_id: u.id,
          source: "manual",
          local_date: date,
          start_time: `${date}T${String(o.hour ?? 7).padStart(2, "0")}:00:00Z`,
          type_key: o.type ?? "running",
          distance_m: o.km * 1000,
          duration_s: o.km * o.secPerKm,
          moving_s: o.km * o.secPerKm,
          avg_hr: o.hr,
          splits: o.laps ? { lapDTOs: o.laps } : null,
        } as never)
        .select("id")
        .single()
    ).data!.id as string;
  const workout = async (date: string, type: string, title: string, blocks: object[], activityId: string | null = null) =>
    (
      await admin()
        .from("planned_workouts")
        .insert({ user_id: u.id, plan_id: planId, date, type, title, blocks, planned_km: 10, planned_duration_s: 3600, phase: "build", week: 3, status: activityId ? "done" : "planned", activity_id: activityId } as never)
        .select("id")
        .single()
    ).data!.id as string;
  /** Clears today's and yesterday's runs so each case is the latest run. */
  const fresh = async () => {
    await admin().from("planned_workouts").delete().eq("user_id", u.id).gte("date", addDays(today, -1));
    await admin().from("activities").delete().eq("user_id", u.id).gte("local_date", addDays(today, -1));
  };
  const threshold = async (laps: object[]) => {
    await fresh();
    const id = await act(today, { km: 10, secPerKm: 300, hr: 165, laps });
    await workout(today, "threshold", "Threshold 2 × 12 min", THRESHOLD, id);
    return (await loadSpot(u.id, today)).verdict!;
  };

  beforeAll(async () => {
    u = await createTestUser("underklokka");
    ({ today } = await seedUser(admin(), u.id, { days: 3 }));
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
    const { data: plan } = await admin()
      .from("training_plans")
      .insert({ user_id: u.id, goal_kind: "build", distance_km: 21.0975, start_date: addDays(today, -60), generated_until: addDays(today, 40), weekdays: [1, 3, 6], long_run_weekday: 6, runs_per_week: 3, vdot: 45.7, start_km_per_week: 30 } as never)
      .select("id")
      .single();
    planId = plan!.id;
    // Five easy runs (6 km, heart rate 155–159) give the usual easy heart rate; one 12.1 km run 21 days back is the
    // ghost, one 12.2 km run 10 days back is too recent to be one.
    for (const [n, hr] of [[3, 155], [4, 156], [5, 157], [6, 158], [8, 159]] as const) await act(addDays(today, -n), { km: 6, secPerKm: 340, hr });
    await act(addDays(today, -21), { km: 12.1, secPerKm: 346, hr: 163 });
    await act(addDays(today, -10), { km: 12.2, secPerKm: 330, hr: 150 });
  });
  afterAll(cleanup);

  const warm = lap(3000, 1110, 146, 0, "WARMUP");
  it("threshold reps against their zone: a bit fast", async () => {
    const t0 = Date.now();
    const v = await threshold([warm, lap(2698, 720, 178, 1), lap(116, 90, 157, 2, "RECOVERY"), lap(2681, 720, 182, 1), lap(1537, 571, 163, 4, "COOLDOWN")]);
    console.log("loadSpot + setup ms", Date.now() - t0);
    expect(v).toMatchObject({ word: "bit_fast", tone: "warn", zone: { min: 269, max: 279 }, repsDone: 2, repsPlanned: 2 });
    expect(v.reps!.map((r) => r.secPerKm)).toEqual([267, 269]);
    expect(v.reps!.map((r) => r.hr)).toEqual([178, 182]);
  });

  it("threshold reps: on target, too fast, cut short", async () => {
    expect((await threshold([warm, lap(1000, 271, 170, 1), lap(1000, 273, 172, 1)])).word).toBe("on_target");
    expect((await threshold([warm, lap(1000, 260, 170, 1), lap(1000, 275, 172, 1)])).word).toBe("too_fast");
    expect(await threshold([warm, lap(1000, 274, 170, 1)])).toMatchObject({ word: "on_target", repsDone: 1, repsPlanned: 2 });
  }, 180_000);

  it("easy runs: strides left out, too fast for easy, treadmill without a word, and the ghost", async () => {
    await fresh();
    const strides = Array.from({ length: 6 }, () => lap(80, 20, 170, 1));
    const id = await act(today, { km: 12.48, secPerKm: 316, hr: 160, laps: [lap(12000, 12000 * 0.319, 159, 0), ...strides, { distance: 0, duration: 30 }] });
    await workout(today, "strides", "Easy 12 km + 6 strides", EASY, id);
    const v = (await loadSpot(u.id, today)).verdict!;
    expect(v).toMatchObject({ word: "nice_easy", tone: "good", easy: { secPerKm: 319, hr: 159 } });
    expect(Number.isFinite(v.easy!.secPerKm)).toBe(true);
    // 12.1 km 21 days back at 5:46 and 163: 27 s/km faster, 4 bpm lower. The 12.2 km run 10 days back is too recent.
    expect(v.ghost).toMatchObject({ date: addDays(today, -21), km: 12.1, secPerKm: 346, hr: 163, deltaS: -27, deltaHr: -4 });

    await fresh();
    const fast = await act(today, { km: 8, secPerKm: 305, hr: 158 });
    await workout(today, "easy", "Easy run 8 km", EASY, fast);
    expect((await loadSpot(u.id, today)).verdict).toMatchObject({ word: "too_fast_easy", tone: "warn" });

    await fresh();
    await act(today, { km: 8, secPerKm: 305, hr: 158, type: "treadmill_running" });
    expect((await loadSpot(u.id, today)).verdict).toMatchObject({ word: null, ghost: null });
  }, 180_000);

  it("two runs on one day: the verdict is on the later one", async () => {
    await fresh();
    await act(today, { km: 6, secPerKm: 340, hr: 150, hour: 6 });
    const late = await act(today, { km: 7, secPerKm: 345, hr: 151, hour: 16 });
    expect((await loadSpot(u.id, today)).verdict!.activityId).toBe(late);
  });

  it("what the week bought: Sunday to Sunday from 18:00, three weeks", async () => {
    const s = lastSunday(addDays(today, -7));
    await admin().from("prediction_days").insert(
      [[21, 6350], [14, 6267], [7, 6210], [0, 6061]].map(([k, v]) => ({ user_id: u.id, local_date: addDays(s, -k!), time_half_s: v, source: "garmin" })) as never,
    );
    const at = (hhmm: string) => loadSpot(u.id, s, { now: zonedTime(s, hhmm, "Europe/Oslo") });
    const evening = await at("19:00");
    expect(evening.week).toMatchObject({ distance: "half", weeks: [{ deltaS: -83 }, { deltaS: -57 }, { deltaS: -149 }] });
    expect(evening.main === "week" || evening.main === "verdict").toBe(true);
    expect((await at("17:00")).week).toBeNull();
  });

  it("an alert not dealt with comes first", async () => {
    await admin().from("daily_notes").upsert({ user_id: u.id, local_date: today, text: "Your resting heart rate is up.", alert: "sick", source: "template", facts: {} } as never, { onConflict: "user_id,local_date" });
    const spot = await loadSpot(u.id, today);
    expect(spot.main).toBe("alert");
    await admin().from("daily_notes").update({ alert_done: true }).eq("user_id", u.id).eq("local_date", today);
    expect((await loadSpot(u.id, today)).main).not.toBe("alert");
  });
});

describe("the weekly challenge (spec 2026-11-18 §7)", () => {
  let u: TestUser;
  let today: string;
  let planId: string;
  const week = () => weekStartOn(today, 1);
  const act = async (date: string, km: number, secPerKm: number, hr: number, laps?: object[]) =>
    (
      await admin()
        .from("activities")
        .insert({ user_id: u.id, source: "manual", local_date: date, start_time: `${date}T07:00:00Z`, type_key: "running", distance_m: km * 1000, duration_s: km * secPerKm, moving_s: km * secPerKm, avg_hr: hr, splits: laps ? { lapDTOs: laps } : null } as never)
        .select("id")
        .single()
    ).data!.id as string;
  const workout = async (date: string, type: string, blocks: object[], activityId: string | null = null) =>
    (
      await admin()
        .from("planned_workouts")
        .insert({ user_id: u.id, plan_id: planId, date, type, title: `${type} session`, blocks, planned_km: 10, planned_duration_s: 3600, phase: "build", week: 3, status: activityId ? "done" : "planned", activity_id: activityId } as never)
        .select("id")
        .single()
    ).data!.id as string;
  const reset = async () => {
    await admin().from("weekly_challenges").delete().eq("user_id", u.id);
    await admin().from("planned_workouts").delete().eq("user_id", u.id).gte("date", week());
  };
  const TEST = [step("warmup", { kind: "distance", m: 2000 }, easyT), step("run", { kind: "distance", m: 5000 }, { kind: "none" }), step("cooldown", { kind: "distance", m: 2000 }, easyT)];

  beforeAll(async () => {
    u = await createTestUser("challenge");
    ({ today } = await seedUser(admin(), u.id, { days: 3 }));
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
    const { data: plan } = await admin()
      .from("training_plans")
      .insert({ user_id: u.id, goal_kind: "build", distance_km: 10, start_date: addDays(today, -60), generated_until: addDays(today, 40), weekdays: [0, 1, 2, 3, 4, 5, 6], long_run_weekday: 6, runs_per_week: 4, vdot: 45.7, start_km_per_week: 30 } as never)
      .select("id")
      .single();
    planId = plan!.id;
    // Usual easy heart rate 150, from five easy runs before this week.
    for (const n of [8, 9, 10, 11, 12]) await act(addDays(week(), -n), 6, 340, 150);
  });
  afterAll(cleanup);

  it("a fitness test: beat Garmin's estimate; decided by the test lap once the run is in", async () => {
    await reset();
    await admin().from("prediction_days").upsert({ user_id: u.id, local_date: today, time_5k_s: 1236, source: "garmin" } as never, { onConflict: "user_id,local_date" });
    const w = await workout(today, "test", TEST);
    expect((await loadSpot(u.id, today)).challenge).toMatchObject({ kind: "test_beat", params: { targetS: 1236, km: 5 }, result: null, workoutDate: today });

    const id = await act(today, 9, 330, 170, [lap(2000, 700, 140, 0, "WARMUP"), lap(5000, 1221, 178, 1), lap(2000, 720, 150, 2, "COOLDOWN")]);
    await admin().from("planned_workouts").update({ status: "done", activity_id: id } as never).eq("id", w);
    await decideChallenges(u.id, today);
    const spot = await loadSpot(u.id, today);
    expect(spot.challenge).toBeNull(); // decided: no longer open
    expect(spot.verdict).toMatchObject({ test: { timeS: 1221, beat: true }, challenge: { kind: "test_beat", result: "won", value: 1221 } });
  }, 300_000);

  it("intervals: last time in the zone → last rep fastest; not the same template two weeks running; two loads make one row", async () => {
    await reset();
    await admin().from("activities").delete().eq("user_id", u.id).gte("local_date", addDays(today, -1));
    const before = await act(addDays(week(), -3), 10, 300, 165, [lap(2000, 680, 140, 0, "WARMUP"), lap(1000, 274, 170, 1), lap(1000, 273, 172, 1)]);
    await workout(addDays(week(), -3), "threshold", THRESHOLD, before);
    const w = await workout(today, "threshold", THRESHOLD);
    expect((await ensureChallenge(u.id, today))).toMatchObject({ kind: "last_rep_fastest" });

    await admin().from("weekly_challenges").delete().eq("user_id", u.id);
    await admin().from("weekly_challenges").insert({ user_id: u.id, week_start: addDays(week(), -7), kind: "last_rep_fastest", params: {} } as never);
    const [a, b] = await Promise.all([ensureChallenge(u.id, today), ensureChallenge(u.id, today)]);
    expect(a).toMatchObject({ kind: "reps_in_zone", params: { min: 269, max: 279 } });
    expect(b).toEqual(a);
    expect((await admin().from("weekly_challenges").select("id").eq("user_id", u.id).eq("week_start", week())).data).toHaveLength(1);

    // Swapped to an easy run: the challenge goes, no ✗.
    await admin().from("planned_workouts").update({ type: "easy", edited: true } as never).eq("id", w);
    expect(await ensureChallenge(u.id, today)).toBeNull();
  }, 300_000);

  it("a week without a key session: every easy run under the usual heart rate, lost at the first one over", async () => {
    await reset();
    await admin().from("activities").delete().eq("user_id", u.id).gte("local_date", week());
    await workout(today, "easy", EASY);
    expect(await ensureChallenge(u.id, today)).toMatchObject({ kind: "easy_hr_week", params: { bpm: 150 } });
    await act(today, 6, 340, 161);
    await decideChallenges(u.id, today);
    const { data: row } = await admin().from("weekly_challenges").select("result, result_value").eq("user_id", u.id).eq("week_start", week()).single();
    expect(row).toMatchObject({ result: "lost", result_value: 161 });
  }, 300_000);
});
