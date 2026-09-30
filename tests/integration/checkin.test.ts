import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureWeeklyCheckin } from "@/lib/db/checkin";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";

describe("weekly check-in", () => {
  let seeded: TestUser;
  let fresh: TestUser;

  beforeAll(async () => {
    seeded = await createTestUser("checkin");
    await seedUser(admin(), seeded.id, { days: 30, kcal: 2600, startKg: 95, endKg: 94 });
    fresh = await createTestUser("fresh");
    await seedUser(admin(), fresh.id, { days: 3 });
  });
  afterAll(cleanup);

  it("proposes a new base within ±150 of the current one", async () => {
    const row = await ensureWeeklyCheckin(seeded.client, seeded.id);
    expect(row?.status).toBe("pending");
    expect(row?.logged_days).toBe(21);
    expect(Math.abs(Number(row?.proposed_base_kcal) - 2600)).toBeLessThanOrEqual(150);
    expect(Number(row?.avg_intake_kcal)).toBe(2600);
  });

  it("is idempotent: a second call returns the same row", async () => {
    const first = await ensureWeeklyCheckin(seeded.client, seeded.id);
    const second = await ensureWeeklyCheckin(seeded.client, seeded.id);
    expect(second?.id).toBe(first?.id);
    const { data } = await admin().from("weekly_checkins").select("id").eq("user_id", seeded.id);
    expect(data).toHaveLength(1);
  });

  it("returns insufficient_data for a user with only a few days of logs", async () => {
    const row = await ensureWeeklyCheckin(fresh.client, fresh.id);
    expect(row?.status).toBe("insufficient_data");
    expect(row?.reason).toBe("too_early");
  });
});
