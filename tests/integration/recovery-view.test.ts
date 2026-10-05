import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, zonedTime } from "@loop/core";
import { saveTokens } from "@/lib/garmin/accounts";
import { computeRecovery } from "@/lib/recovery/compute";
import { loadRecoveryDay } from "@/lib/recovery/day";
import { loadRecoveryView } from "@/lib/recovery/view";
import { getAiHealthConsent, setAiHealthConsent } from "@/lib/recovery/consent";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";

describe("recovery: AI consent", () => {
  let u: TestUser;
  beforeAll(async () => {
    u = await createTestUser("consent");
    await seedUser(admin(), u.id, { days: 2 });
  });
  afterAll(cleanup);

  it("is off by default and can be switched on and off", async () => {
    expect(await getAiHealthConsent(u.id)).toBe(false);
    await setAiHealthConsent(u.id, true);
    expect(await getAiHealthConsent(u.id)).toBe(true);
    const { data } = await admin().from("profiles").select("ai_health_consent_at").eq("user_id", u.id).single();
    expect(data!.ai_health_consent_at).not.toBeNull();
    await setAiHealthConsent(u.id, false);
    expect(await getAiHealthConsent(u.id)).toBe(false);
  });

  it("a signed-in user only sees their own AI rows", async () => {
    await admin().from("recovery_summaries").insert({ user_id: u.id, week_start: "2026-09-28", content: { headline: "x", sentences: [], tips: [] } });
    const { data } = await u.client.from("recovery_summaries").select("week_start");
    expect(data).toHaveLength(1);
  });
});

describe("recovery: tab and day sheet data", () => {
  let u: TestUser;
  let today: string;
  const TZ = "Europe/Oslo";

  beforeAll(async () => {
    u = await createTestUser("recovery-view");
    ({ today } = await seedUser(admin(), u.id, { days: 2 }));
  });
  afterAll(cleanup);

  it("without Garmin: an empty tab, no crash", async () => {
    const v = await loadRecoveryView(u.id);
    expect(v.garmin).toBe("none");
    expect(v.findings).toEqual([]);
    expect(v.curves.hrv).toEqual([]);
  });

  it("with nights and food: curves with a normal band, findings in rank order, progress", async () => {
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
    await admin().from("garmin_accounts").update({ recovery_backfilled_until: addDays(today, -39) }).eq("user_id", u.id);
    const nights = Array.from({ length: 60 }, (_, i) => ({
      user_id: u.id,
      local_date: addDays(today, -i),
      sleep_s: 27000,
      deep_s: 5400,
      light_s: 15000,
      rem_s: 6000,
      awake_s: 600,
      sleep_score: 70 + (i % 9),
      hrv_avg: 55 + (i % 7),
      resting_hr: 48 + (i % 4),
    }));
    await admin().from("recovery_days").insert(nights);
    const y = addDays(today, -1);
    const { data: es } = await admin()
      .from("food_entries")
      .insert([
        { user_id: u.id, logged_at: zonedTime(y, "12:00", TZ).toISOString(), local_date: y, meal_type: "lunch", source: "quick" },
        { user_id: u.id, logged_at: zonedTime(y, "21:15", TZ).toISOString(), local_date: y, meal_type: "dinner", source: "quick" },
      ])
      .select("id");
    await admin().from("food_items").insert(es!.map((e, i) => ({ user_id: u.id, food_entry_id: e.id, name: i ? "Wine" : "Pasta", kcal: i ? 250 : 900, carbs_g: i ? 5 : 120, protein_g: 30, alcohol_g: i ? 24 : 0 })));
    await computeRecovery(u.id, today, { force: true });

    const v = await loadRecoveryView(u.id);
    expect(v.garmin).toBe("active");
    expect(v.historyDays).toBe(40);
    expect(v.curves.hrv).toHaveLength(30);
    expect(v.curves.hrv.at(-1)!.low).not.toBeNull();
    expect(v.findings.length).toBeLessThanOrEqual(5);
    expect(v.needsData.every((f) => f.kind === "needs_data" && f.source === "engine")).toBe(true);

    const d = await loadRecoveryDay(u.id, today);
    expect(d.night!.sleepS).toBe(27000);
    expect(d.normal.hrv.low).not.toBeNull();
    expect(d.before.kcal).toBe(2600 + 900 + 250); // seeded day + pasta + wine
    expect(d.before.meals).toBe(3); // seeded day entry + 2
    expect(d.before.alcoholG).toBe(24);
    expect(d.before.lateKcal).toBe(250);
  });
});
