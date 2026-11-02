import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, alertFor, pickRace, type RecoveryDayInput } from "@loop/core";
import { saveTokens } from "@/lib/garmin/accounts";
import { syncGarmin } from "@/lib/garmin/sync";
import { dailyNote, swapToEasy } from "@/lib/health/note";
import { loadClock, loadStampLine } from "@/lib/health/view";
import { afterGarminSync } from "@/lib/training/service";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";
import { FakeGarmin, run } from "./fake-garmin";

const at = (lat: number, lon: number) => ({ extra: { startLatitude: lat, startLongitude: lon } });

describe("health: race clock, stamps and the morning note (spec 2026-11-02)", () => {
  let u: TestUser;
  let today: string;
  const garmin = new FakeGarmin();
  const sync = () => syncGarmin(u.id, { source: garmin, afterSync: (id, t) => afterGarminSync(id, t, garmin) });
  const stamps = async () => (await admin().from("stamps").select("kind, key, earned_on").eq("user_id", u.id)).data ?? [];

  beforeAll(async () => {
    u = await createTestUser("health");
    ({ today } = await seedUser(admin(), u.id, { days: 3 }));
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
    garmin.activities = [
      run(addDays(today, -3), 15.2, at(35.69, 139.7)), // Tokyo
      run(addDays(today, -2), 30, { type: "road_biking", ...at(59.91, 10.75) }), // a ride in Oslo
    ];
    garmin.history = [
      { id: 1, date: "2024-03-13", typeKey: "running", lat: 21.03, lon: 105.85, km: 8 }, // Hanoi
      { id: 2, date: "2023-05-01", typeKey: "hiking", lat: 37.56, lon: 126.97, km: 9 }, // Seoul, a hike: no stamp
      { id: garmin.activities[0]!.activityId, date: addDays(today, -3), typeKey: "running", lat: 35.69, lon: 139.7, km: 15.2 },
    ];
    garmin.predictionDays = [2, 1, 0].map((n) => ({ calendarDate: addDays(today, -n), time5K: 1300 - n, time10K: 2800 + n * 6, timeHalfMarathon: 6300 + n * 10, timeMarathon: 13800 }));
    garmin.personalRecords = [{ typeId: 5, value: 6200.4, date: addDays(today, -40), activityId: 99 }];
  });
  afterAll(cleanup);

  it("a sync stores daily predictions, records and the history once; stamps come from runs, rides and history", async () => {
    expect((await sync()).status).toBe("ok");
    const { data: preds } = await admin().from("prediction_days").select("local_date, time_10k_s").eq("user_id", u.id).order("local_date");
    expect(preds!.map((p) => p.time_10k_s)).toEqual([2812, 2806, 2800]);
    const { data: acct } = await admin().from("garmin_accounts").select("personal_records, history_scanned_at").eq("user_id", u.id).single();
    expect(acct!.history_scanned_at).not.toBeNull();
    expect(acct!.personal_records).toHaveLength(1);

    const s = await stamps();
    const keys = s.map((x) => `${x.kind}:${x.key}`).sort();
    expect(keys).toEqual(expect.arrayContaining(["country:JPN", "country:NOR", "country:VNM", "distance:10", "distance:15", "pr:pr-5-6200"]));
    expect(keys).not.toContain("country:KOR"); // a hike gives no country
    expect(s.find((x) => x.key === "VNM")!.earned_on).toBe("2024-03-13");

    // A second sync neither fetches the history again nor adds rows.
    await admin().from("garmin_accounts").update({ sync_started_at: null }).eq("user_id", u.id);
    await sync();
    expect(garmin.historyFetches).toBe(1);
    expect((await stamps()).length).toBe(s.length);
  });

  it("stamps from before today stay out of Today's stamp line", async () => {
    expect(await loadStampLine(u.id, today)).toBeNull();
  });

  it("the clock: 10K without a plan, then the plan's race session; the change since yesterday", async () => {
    const c = await loadClock(u.id, today);
    expect(c!.race).toEqual({ name: "10K", distance: "10k", date: null });
    expect(c!.seconds).toBe(2800);
    expect(c!.deltaS).toBe(-6);

    const { data: plan } = await admin()
      .from("training_plans")
      .insert({ user_id: u.id, goal_kind: "build", distance_km: 21.0975, start_date: addDays(today, -30), generated_until: addDays(today, 60), weekdays: [1, 2, 3, 5], long_run_weekday: 5, runs_per_week: 4, vdot: 45, start_km_per_week: 30 })
      .select("id")
      .single();
    const w = (date: string, type: string, title: string, km: number, mins: number) => ({ user_id: u.id, plan_id: plan!.id, date, type, title, planned_km: km, planned_duration_s: mins * 60, blocks: [], phase: "build", week: 5 });
    await admin().from("planned_workouts").insert([w(today, "intervals", "Intervals 6 × 1 km", 12, 60), w(addDays(today, 40), "race", "Doomsday: Half Marathon", 21.1, 105)] as never);
    const c2 = await loadClock(u.id, today);
    expect(c2!.race).toEqual({ name: "Doomsday: Half Marathon", distance: "half", date: addDays(today, 40) });
    expect(c2!.seconds).toBe(6300);
    expect(c2!.deltaS).toBe(-10);
  });

  it("pickRace: a race plan's goal, a build focus, and a passed race moves on", () => {
    const goal = { kind: "race" as const, distance: "10k" as const, raceDate: "2026-12-01" };
    expect(pickRace({ today: "2026-11-02", workouts: [], goal }).distance).toBe("10k");
    expect(pickRace({ today: "2026-11-02", workouts: [], goal: { kind: "build", focus: "marathon" } }).name).toBe("Marathon");
    expect(pickRace({ today: "2026-12-03", workouts: [], goal }).name).toBe("10K"); // passed: the fallback, no race day
    expect(pickRace({ today: "2026-12-03", workouts: [], goal }).date).toBeNull();
  });

  it("alerts: two off mornings → sick, one is not enough; easy runs too fast", () => {
    const days = (offFrom: number): RecoveryDayInput[] =>
      Array.from({ length: 32 }, (_, i) => ({
        date: addDays("2026-11-02", -31 + i),
        sleepScore: 78, hrv: i >= offFrom ? 44 : 60 + (i % 4), restingHr: i >= offFrom ? 57 : 50 + (i % 3), hrvLow: 52, hrvHigh: 68,
        food: null, hard: false, long: false, steps: null, easyMetersPerBeat: null, qualityPaceRatio: null,
      }));
    expect(alertFor({ days: days(30), today: "2026-11-02", easyRuns: [], easyFastSecPerKm: null })?.kind).toBe("sick");
    expect(alertFor({ days: days(31), today: "2026-11-02", easyRuns: [], easyFastSecPerKm: null })).toBeNull();
    const easy = [5, 4, 3, 2].map((n, i) => ({ date: addDays("2026-11-02", -n), secPerKm: i === 0 ? 360 : 300 }));
    expect(alertFor({ days: days(99), today: "2026-11-02", easyRuns: easy, easyFastSecPerKm: 330 })?.kind).toBe("easy_fast");
  });

  it("the note: written once from a template without AI, carries the alert; Swap turns today's intervals into an easy run, once", async () => {
    await admin().from("recovery_days").insert(
      Array.from({ length: 32 }, (_, i) => {
        const off = i >= 30;
        return { user_id: u.id, local_date: addDays(today, -31 + i), resting_hr: off ? 57 : 50 + (i % 3), hrv_avg: off ? 44 : 60 + (i % 4), hrv_baseline_low: 52, hrv_baseline_high: 68, sleep_score: 78 };
      }),
    );
    const n = await dailyNote(u.id, today);
    expect(n.alert).toBe("sick");
    expect(n.text).toContain("resting heart rate is up");
    expect(n.swap).toEqual({ title: "Intervals 6 × 1 km", km: expect.any(Number) });
    const { data: stored } = await admin().from("daily_notes").select("source, alert").eq("user_id", u.id).eq("local_date", today).single();
    expect(stored).toEqual({ source: "template", alert: "sick" });

    expect(await swapToEasy(u.id, today)).toBe(true);
    const { data: w } = await admin().from("planned_workouts").select("type, edited").eq("user_id", u.id).eq("date", today).single();
    expect(w).toEqual({ type: "easy", edited: true });
    expect(await swapToEasy(u.id, today)).toBe(false);
    expect((await dailyNote(u.id, today)).alertDone).toBe(true);
  });
});
