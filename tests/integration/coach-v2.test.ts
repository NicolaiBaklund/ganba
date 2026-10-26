import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encryptSecret } from "@/lib/ai/crypto";
import { runCoach } from "@/lib/coach/run";
import { createPlan } from "@/lib/training/service";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";
import { FakeCoach, ctxOf, tool } from "./fake-coach";

const addKey = async (uid: string) => {
  const enc = encryptSecret("sk-ant-test-0000000000000000");
  await admin().from("api_keys").insert({ user_id: uid, provider: "anthropic", ciphertext: enc.ciphertext, iv: enc.iv, auth_tag: enc.authTag, last4: "0000" });
};
const logMeal = async (uid: string, date: string, name: string, m: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }) => {
  const { data: e } = await admin().from("food_entries").insert({ user_id: uid, logged_at: `${date}T03:00:00Z`, local_date: date, meal_type: "lunch", source: "quick" }).select("id").single();
  await admin().from("food_items").insert({ user_id: uid, food_entry_id: e!.id, name, ...m });
};

describe("coach v2: context", () => {
  let u: TestUser;
  let today: string;
  const ai = new FakeCoach();

  beforeAll(async () => {
    u = await createTestUser("coach2");
    ({ today } = await seedUser(admin(), u.id, { days: 10 }));
    await addKey(u.id);
  });
  afterAll(cleanup);

  it("answers a food question without a plan", async () => {
    ai.script = [() => tool("reply", { message: "Get a bowl of ramen with extra egg.", options: [] })];
    const r = await runCoach(u.id, { text: "I have 700 kcal left, what should I eat?" }, { ai });
    expect(r.ok && r.message.text).toBe("Get a bowl of ramen with extra egg.");
    expect(ai.calls[0]!.tools.map((t) => t.name)).not.toContain("check_plan_changes");
    expect(ctxOf(ai.calls[0]!)).toContain("No training plan right now");
  });

  it("the context always has yesterday/today/tomorrow and today's intake", async () => {
    await logMeal(u.id, today, "Salmon onigiri", { kcal: 600, protein_g: 35, carbs_g: 80, fat_g: 12 });
    await createPlan(u.id, { goal: { kind: "build" }, weekdays: [0, 1, 2, 3, 4, 5, 6], longRunWeekday: 0, runsPerWeek: 4 });
    ai.script = [() => tool("reply", { message: "ok", options: [] })];
    await runCoach(u.id, { text: "how is today?" }, { ai });
    const text = ctxOf(ai.calls.at(-1)!);
    expect(text).toMatch(/Today's intake: 600 of \d+ kcal \(\d+ left\); protein 35\/\d+ g, carbs 80\/\d+ g/);
    expect(text).toMatch(/^Yesterday \(/m);
    expect(text).toMatch(/^Today \(/m);
    expect(text).toMatch(/^Tomorrow \(/m);
    expect(ai.calls.at(-1)!.tools.map((t) => t.name)).toContain("check_plan_changes");
  });
});
