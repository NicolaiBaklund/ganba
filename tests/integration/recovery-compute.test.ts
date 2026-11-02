import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, zonedTime } from "@loop/core";
import { saveTokens } from "@/lib/garmin/accounts";
import { syncGarmin } from "@/lib/garmin/sync";
import { loadRecoveryDays } from "@/lib/recovery/load";
import { afterGarminSync } from "@/lib/training/service";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";
import { FakeGarmin, run } from "./fake-garmin";

const TZ = "Europe/Oslo";
const KCAL = [1500, 2100, 2700];
/** Deterministic pseudo-random 0..1 per index (no calendar pattern in the test data). */
const noise = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

describe("recovery: load days from Garmin and food", () => {
  let u: TestUser;
  let today: string;
  const garmin = new FakeGarmin();

  beforeAll(async () => {
    u = await createTestUser("recovery-compute");
    ({ today } = await seedUser(admin(), u.id, { days: 2 })); // food on today-2 and today-1 only (1 entry each)
    const a = admin();
    // 100 days: two meals a day; HRV next morning falls with the deficit (expenditure − intake).
    const entries: { user_id: string; logged_at: string; local_date: string; meal_type: "lunch" | "dinner"; source: "quick" }[] = [];
    const kcalOf = new Map<string, number>();
    for (let i = 3; i <= 102; i++) {
      const d = addDays(today, -i);
      const kcal = KCAL[Math.floor(noise(i, 1) * 3)]!;
      kcalOf.set(d, kcal);
      entries.push({ user_id: u.id, logged_at: zonedTime(d, "12:00", TZ).toISOString(), local_date: d, meal_type: "lunch", source: "quick" });
      entries.push({ user_id: u.id, logged_at: zonedTime(d, i % 4 === 0 ? "21:00" : "18:00", TZ).toISOString(), local_date: d, meal_type: "dinner", source: "quick" });
    }
    const { data: saved, error } = await a.from("food_entries").insert(entries).select("id, local_date");
    if (error) throw error;
    const { error: itemsErr } = await a
      .from("food_items")
      .insert(saved!.map((e) => ({ user_id: u.id, food_entry_id: e.id, name: "Meal", kcal: kcalOf.get(e.local_date)! / 2, protein_g: 70, carbs_g: 150, fat_g: 30 })));
    if (itemsErr) throw itemsErr;
    const nights = [];
    for (let i = 0; i <= 102; i++) {
      const d = addDays(today, -i);
      const prevKcal = kcalOf.get(addDays(d, -1)) ?? 2100;
      nights.push({ user_id: u.id, local_date: d, sleep_s: 27000, sleep_score: 75 + Math.floor(noise(i, 2) * 5), hrv_avg: Math.round(60 + (prevKcal - 2100) / 100 + noise(i, 3) * 3), resting_hr: 50 });
    }
    const { error: nightsErr } = await a.from("recovery_days").insert(nights);
    if (nightsErr) throw nightsErr;
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
  });
  afterAll(cleanup);

  it("builds day inputs: logged days, half-logged days, late meals, logged-afterwards times", async () => {
    const a = admin();
    const half = addDays(today, -110); // two meals, 600 kcal → under half the target
    const { data: es } = await a
      .from("food_entries")
      .insert([
        { user_id: u.id, logged_at: zonedTime(half, "08:00", TZ).toISOString(), local_date: half, meal_type: "breakfast", source: "quick" },
        { user_id: u.id, logged_at: zonedTime(half, "12:00", TZ).toISOString(), local_date: half, meal_type: "lunch", source: "quick" },
      ])
      .select("id");
    await a.from("food_items").insert(es!.map((e) => ({ user_id: u.id, food_entry_id: e.id, name: "Snack", kcal: 300 })));
    const after = addDays(today, -104); // dinner logged the next morning
    const { data: e2 } = await a
      .from("food_entries")
      .insert([
        { user_id: u.id, logged_at: zonedTime(after, "12:00", TZ).toISOString(), local_date: after, meal_type: "lunch", source: "quick" },
        { user_id: u.id, logged_at: zonedTime(addDays(after, 1), "08:00", TZ).toISOString(), local_date: after, meal_type: "dinner", source: "quick" },
      ])
      .select("id");
    await a.from("food_items").insert(e2!.map((e) => ({ user_id: u.id, food_entry_id: e.id, name: "Meal", kcal: 1100, alcohol_g: 15 })));

    const days = await loadRecoveryDays(u.id, today);
    const at = (d: string) => days.find((x) => x.date === d)!;
    expect(days).toHaveLength(120);
    expect(at(half).food).toBeNull();
    expect(at(after).food!.lateKcal).toBeNull();
    expect(at(after).food!.alcoholG).toBe(30);
    expect(at(addDays(today, -4)).food!.lateKcal).toBeGreaterThanOrEqual(300); // i = 4: dinner at 21:00
    expect(at(addDays(today, -5)).food!.lateKcal).toBe(0);
    expect(at(addDays(today, -1)).food).toBeNull(); // seeded day: one entry only
    expect(at(today).food).toBeNull();
    expect(at(today).hrv).not.toBeNull();
  });

  it("hard, long and easy runs come from Garmin activities", async () => {
    const d = addDays(today, -1);
    garmin.activities = [
      { ...run(addDays(today, -3), 8), anaerobicTrainingEffect: 2.5, aerobicTrainingEffect: 3.0 },
      run(addDays(today, -2), 18, { minutes: 100 }),
      run(d, 6, { minutes: 35 }),
    ];
    await syncGarmin(u.id, { source: garmin });
    const days = await loadRecoveryDays(u.id, today);
    const at = (x: string) => days.find((y) => y.date === x)!;
    expect(at(addDays(today, -3)).hard).toBe(true);
    expect(at(addDays(today, -3)).easyMetersPerBeat).toBeNull();
    expect(at(addDays(today, -2)).long).toBe(true);
    expect(at(d).easyMetersPerBeat).toBeCloseTo(6000 / 35 / 150, 3);
    expect(at(d).hard).toBe(false);
  });
});

describe("recovery: many small entries", () => {
  let u: TestUser;
  let today: string;

  beforeAll(async () => {
    u = await createTestUser("recovery-many");
    ({ today } = await seedUser(admin(), u.id, { days: 2 }));
    // 95 days × 11 entries of 200 kcal = 1045 entries: more than one PostgREST page (1000 rows).
    const entries = [];
    for (let i = 3; i < 98; i++) {
      const d = addDays(today, -i);
      for (let k = 0; k < 11; k++) entries.push({ user_id: u.id, logged_at: zonedTime(d, `${String(8 + k).padStart(2, "0")}:00`, TZ).toISOString(), local_date: d, meal_type: "snack" as const, source: "quick" as const });
    }
    const { data: saved, error } = await admin().from("food_entries").insert(entries).select("id");
    if (error) throw error;
    const { error: itemsErr } = await admin().from("food_items").insert(saved!.map((e) => ({ user_id: u.id, food_entry_id: e.id, name: "Snack", kcal: 200, carbs_g: 30, protein_g: 10 })));
    if (itemsErr) throw itemsErr;
  });
  afterAll(cleanup);

  it("every entry counts, also past the first 1000 rows", async () => {
    const days = await loadRecoveryDays(u.id, today);
    const logged = days.filter((d) => d.food);
    expect(logged).toHaveLength(95);
    expect(new Set(logged.map((d) => Math.round(d.food!.carbsPerKg * 1000))).size).toBe(1); // 11 × 30 g every day
  });
});
