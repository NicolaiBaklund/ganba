import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activityKcal, addDays, KCAL_PER_KG, walkingAddonKcal } from "@loop/core";
import { saveTokens } from "@/lib/garmin/accounts";
import { makeBasePassive } from "@/lib/garmin/connect";
import { syncGarmin } from "@/lib/garmin/sync";
import { getDaySnapshot } from "@/lib/db/today";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";
import { authError, FakeGarmin, run } from "./fake-garmin";

describe("Garmin: connect, sync and the daily target", () => {
  let u: TestUser;
  let today: string;
  const garmin = new FakeGarmin();

  beforeAll(async () => {
    u = await createTestUser("garmin");
    ({ today } = await seedUser(admin(), u.id, { days: 20, baseKcal: 2600 }));
    const y = addDays(today, -1);
    garmin.days = [
      { calendarDate: addDays(today, -3), totalSteps: 9000 },
      { calendarDate: y, totalSteps: 18_000 },
      { calendarDate: today, totalSteps: 3000 },
    ];
    garmin.activities = [
      run(y, 10, { steps: 8000 }),
      { ...run(y, 0), activityType: { typeKey: "strength_training" }, distance: null, duration: 3600, steps: null },
      { ...run(y, 3), activityType: { typeKey: "walking" } },
    ];
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
  });
  afterAll(cleanup);

  it("first connection removes the walking add-on from the base, once", async () => {
    await makeBasePassive(u.id);
    await makeBasePassive(u.id);
    const { data } = await admin().from("energy_plans").select("base_expenditure_kcal, source").eq("user_id", u.id).eq("source", "garmin_connect");
    expect(data).toHaveLength(1);
    const { data: weights } = await admin().from("weight_entries").select("weight_kg").eq("user_id", u.id);
    expect(weights?.length).toBeGreaterThan(0);
    const removed = 2600 - Number(data![0]!.base_expenditure_kcal);
    // Same formula as onboarding (10 000 steps, 30 km/week) at roughly the seeded weight.
    expect(removed).toBeGreaterThan(walkingAddonKcal({ stepsPerDay: 10_000, runKmPerWeek: 30, otherTrainingHoursPerWeek: 0 }, 90) - 5);
    expect(removed).toBeLessThan(walkingAddonKcal({ stepsPerDay: 10_000, runKmPerWeek: 30, otherTrainingHoursPerWeek: 0 }, 100) + 5);
  });

  it("first sync imports 90 days of steps and activities with run details", async () => {
    const out = await syncGarmin(u.id, { source: garmin });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.firstSync).toBe(true);
    expect(out.from).toBe(addDays(today, -89));
    const { data: days } = await admin().from("garmin_days").select("local_date, steps, final").eq("user_id", u.id).order("local_date");
    expect(days).toHaveLength(3);
    expect(days!.find((d) => d.local_date === today)?.final).toBe(false);
    const { data: acts } = await admin().from("activities").select("type_key, splits").eq("user_id", u.id);
    expect(acts).toHaveLength(3);
    expect(acts!.find((a) => a.type_key === "running")?.splits).toBeTruthy();
  });

  it("yesterday's target = base + steps (minus running steps) + run + strength − deficit", async () => {
    const y = addDays(today, -1);
    const snap = await getDaySnapshot(u.client, u.id, y);
    expect(snap.activity?.source).toBe("garmin");
    const kg = snap.latestTrendKg!;
    const expected = activityKcal(
      {
        steps: 18_000,
        activities: [
          { typeKey: "running", distanceM: 10_000, durationS: 3300, steps: 8000 },
          { typeKey: "strength_training", distanceM: null, durationS: 3600, steps: null },
          { typeKey: "walking", distanceM: 3000, durationS: 990, steps: 2550 },
        ],
      },
      kg,
    );
    // walking activity counted only through steps; running steps taken out
    expect(snap.activity?.walkingKcal).toBe(Math.round(((18_000 - 8000 - 4000) / 1000) * 0.4 * kg));
    expect(snap.activity?.total).toBe(expected.total);
    expect(snap.target.kcal).toBe(Math.round(snap.baseKcal + expected.total + (-0.5 * KCAL_PER_KG) / 7));
  });

  it("a past day without watch data uses the 14-day average", async () => {
    const snap = await getDaySnapshot(u.client, u.id, addDays(today, -2));
    expect(snap.activity?.source).toBe("average");
    expect(snap.activity?.total).toBeGreaterThan(0);
  });

  it("activities deleted in Garmin disappear on the next sync; only new runs get details", async () => {
    garmin.activities = garmin.activities.filter((a) => a.activityType?.typeKey !== "strength_training");
    await admin().from("garmin_accounts").update({ sync_started_at: null }).eq("user_id", u.id);
    const out = await syncGarmin(u.id, { source: garmin });
    expect(out.status).toBe("ok");
    const { data: acts } = await admin().from("activities").select("type_key").eq("user_id", u.id);
    expect(acts?.map((a) => a.type_key).sort()).toEqual(["running", "walking"]);
    expect(garmin.fetches.at(-1)!.knownIds).toHaveLength(1);
  });

  it("expired tokens mark the account for re-login and the app keeps working", async () => {
    garmin.failWith = authError();
    const out = await syncGarmin(u.id, { source: garmin });
    expect(out.status).toBe("reauth_required");
    const snap = await getDaySnapshot(u.client, u.id);
    expect(snap.garmin?.status).toBe("reauth_required");
    expect(snap.target.kcal).toBeGreaterThan(0);
    garmin.failWith = null;
  });

  it("tokens are not readable by the signed-in user", async () => {
    const { data } = await u.client.from("garmin_accounts").select("*");
    expect(data ?? []).toEqual([]);
    const { data: days } = await u.client.from("garmin_days").select("local_date");
    expect(days?.length).toBe(3);
  });
});
