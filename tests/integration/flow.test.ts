import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dailyTarget, localDate, trainingKcalPerDay } from "@loop/core";
import { getDaySnapshot } from "@/lib/db/today";
import { cleanup, createTestUser, type TestUser } from "./setup";

describe("core flow: onboarding rows + quick add + weight → day snapshot", () => {
  let u: TestUser;
  const tz = "Europe/Oslo";
  const today = localDate(tz);

  beforeAll(async () => {
    u = await createTestUser("flow");
    const c = u.client;
    await c.from("profiles").insert({ user_id: u.id, sex: "female", birth_date: "1995-06-01", height_cm: 168, timezone: tz, onboarded_at: new Date().toISOString() });
    await c.from("activity_baselines").insert({ user_id: u.id, steps_per_day: 9000, run_km_per_week: 20, other_training_hours_per_week: 2, valid_from: today });
    await c.from("goals").insert({ user_id: u.id, target_weight_kg: 62, rate_kg_per_week: -0.25, valid_from: today });
    await c.from("energy_plans").insert({ user_id: u.id, base_expenditure_kcal: 1900, source: "formula", protein_g_per_kg: 2, fat_pct: 0.25, valid_from: today });
    await c.from("weight_entries").insert({ user_id: u.id, measured_at: new Date().toISOString(), local_date: today, weight_kg: 66 });
    const { data: e } = await c
      .from("food_entries")
      .insert({ user_id: u.id, logged_at: new Date().toISOString(), local_date: today, meal_type: "lunch", source: "quick" })
      .select("id")
      .single();
    await c.from("food_items").insert([
      { user_id: u.id, food_entry_id: e!.id, name: "Quick add", kcal: 540, protein_g: 30, carbs_g: 60, fat_g: 18 },
      { user_id: u.id, food_entry_id: e!.id, name: "Apple", kcal: 80, protein_g: 0, carbs_g: 20, fat_g: 0 },
    ]);
  });
  afterAll(cleanup);

  it("sums intake and computes the target from the same inputs as core", async () => {
    const snap = await getDaySnapshot(u.client, u.id);
    expect(snap.date).toBe(today);
    expect(snap.intake.kcal).toBe(620);
    expect(snap.intake.proteinG).toBe(30);

    const training = trainingKcalPerDay({ stepsPerDay: 9000, runKmPerWeek: 20, otherTrainingHoursPerWeek: 2 }, 66);
    const expected = dailyTarget({
      plan: { baseExpenditureKcal: 1900, proteinGPerKg: 2, fatPct: 0.25, manualKcalOverride: null },
      trainingKcal: training,
      rateKgPerWeek: -0.25,
      sex: "female",
    });
    expect(snap.target).toEqual(expected);
    expect(snap.macrosTarget.proteinG).toBe(132);
    expect(snap.latestTrendKg).toBe(66);
  });

  it("a day without data returns zero intake instead of failing", async () => {
    const snap = await getDaySnapshot(u.client, u.id, "2020-01-01");
    expect(snap.intake.kcal).toBe(0);
    expect(snap.entries).toEqual([]);
  });
});
