import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@loop/core";
import { saveTokens } from "@/lib/garmin/accounts";
import { GarminError } from "@/lib/garmin/adapter";
import { syncGarmin } from "@/lib/garmin/sync";
import { backfillProgress, recoveryDates } from "@/lib/recovery/fetch";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";
import { FakeGarmin, night, run } from "./fake-garmin";

describe("recovery: sleep and HRV from Garmin", () => {
  let u: TestUser;
  let today: string;
  const garmin = new FakeGarmin();
  const unlock = () => admin().from("garmin_accounts").update({ sync_started_at: null }).eq("user_id", u.id);

  beforeAll(async () => {
    u = await createTestUser("recovery-sync");
    ({ today } = await seedUser(admin(), u.id, { days: 2 }));
    for (let i = 0; i < 90; i++) {
      const d = addDays(today, -i);
      if (i !== 5) garmin.nights[d] = night(d, { score: 70 + (i % 10), hrv: 55 + (i % 7), rhr: 48 + (i % 4) });
    }
    garmin.days = [{ calendarDate: today, totalSteps: 4000 }];
    garmin.activities = [{ ...run(addDays(today, -1), 8), aerobicTrainingEffect: 3.8, anaerobicTrainingEffect: 2.4 }];
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
  });
  afterAll(cleanup);

  it("first sync stores only the last 3 mornings (history waits, the first sync is already heavy), keyed to the wake-up date", async () => {
    const out = await syncGarmin(u.id, { source: garmin });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(garmin.recoveryFetches[0]).toHaveLength(3);
    expect(out.nights).toBe(3);
    const { data: rows } = await admin().from("recovery_days").select("*").eq("user_id", u.id).order("local_date", { ascending: false });
    expect(rows![0]!.local_date).toBe(today);
    const r0 = rows![0]!;
    expect(r0.sleep_score).toBe(70);
    expect(r0.hrv_avg).toBe(55);
    expect(r0.resting_hr).toBe(48);
    expect(r0.hrv_baseline_low).toBe(52);
    expect(r0.sleep_s).toBe(27000);
    expect(JSON.stringify(r0.raw)).not.toContain("sleepLevels");
    const { data: acct } = await admin().from("garmin_accounts").select("recovery_backfilled_until").eq("user_id", u.id).single();
    expect(acct!.recovery_backfilled_until).toBe(addDays(today, -2));
    expect(backfillProgress(today, acct!.recovery_backfilled_until)).toBe(3);
    const { data: act } = await admin().from("activities").select("te_aerobic, te_anaerobic").eq("user_id", u.id).single();
    expect(Number(act!.te_anaerobic)).toBe(2.4);
  });

  it("each later sync goes 10 days further back until 90 days are covered", async () => {
    for (let i = 0; i < 10; i++) {
      await unlock();
      await syncGarmin(u.id, { source: garmin });
    }
    const { data: acct } = await admin().from("garmin_accounts").select("recovery_backfilled_until").eq("user_id", u.id).single();
    expect(acct!.recovery_backfilled_until).toBe(addDays(today, -89));
    expect(garmin.recoveryFetches.at(-1)).toHaveLength(3); // only recent mornings left
    const { count } = await admin().from("recovery_days").select("id", { count: "exact", head: true }).eq("user_id", u.id);
    expect(count).toBe(89); // morning today-5 had no sleep: no row, never filled in
    const { data: gap } = await admin().from("recovery_days").select("id").eq("user_id", u.id).eq("local_date", addDays(today, -5));
    expect(gap).toEqual([]);
  });

  it("nights that do not exist (watch off at night) are not fetched again on every sync", async () => {
    const off = Array.from({ length: 15 }, (_, i) => addDays(today, -i));
    for (const d of off) delete garmin.nights[d];
    await admin().from("recovery_days").delete().eq("user_id", u.id).in("local_date", off);
    for (let i = 0; i < 2; i++) {
      await unlock();
      await syncGarmin(u.id, { source: garmin });
      expect(garmin.recoveryFetches.at(-1)).toHaveLength(3);
    }
    for (const d of off) garmin.nights[d] = night(d);
    await unlock();
    await syncGarmin(u.id, { source: garmin });
  });

  it("a pause in syncing leaves no gap: recent mornings reach back to the last stored night", () => {
    const { dates } = recoveryDates(today, addDays(today, -6), addDays(today, -89));
    expect(dates).toEqual(Array.from({ length: 8 }, (_, i) => addDays(today, -i)));
    expect(recoveryDates(today, addDays(today, -40), null).dates).toHaveLength(20); // 10 recent (cap) + 10 history
  });

  it("an adapter without fetch_recovery does not break the sync", async () => {
    await unlock();
    garmin.recoveryFailWith = new GarminError("bad_request");
    const out = await syncGarmin(u.id, { source: garmin });
    expect(out.status).toBe("ok");
    if (out.status === "ok") expect(out.nights).toBeNull();
    garmin.recoveryFailWith = null;
  });

  it("expired tokens during the sleep fetch ask for a new login", async () => {
    await unlock();
    garmin.recoveryFailWith = new GarminError("auth");
    expect((await syncGarmin(u.id, { source: garmin })).status).toBe("reauth_required");
    garmin.recoveryFailWith = null;
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
  });

  it("the signed-in user reads only their own nights", async () => {
    const { data } = await u.client.from("recovery_days").select("local_date");
    expect(data?.length).toBe(78); // 89 − 14 removed (today-5 never existed) + 3 recent fetched again
  });
});
