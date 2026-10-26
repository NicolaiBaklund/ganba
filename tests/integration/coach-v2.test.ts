import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encryptSecret } from "@/lib/ai/crypto";
import { addDays } from "@loop/core";
import { runCoach } from "@/lib/coach/run";
import { buildCoachContext } from "@/lib/coach/context";
import { activeThread } from "@/lib/coach/store";
import { readTools, runReadTool, TOOL_LABELS } from "@/lib/coach/tools";
import { coachResponse, type CoachEvent } from "@/lib/coach/stream";
import { recentMessages } from "@/lib/coach/store";
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

describe("coach v2: read tools", () => {
  let u: TestUser;
  let today: string;
  const ai = new FakeCoach();
  const ctx = async () => buildCoachContext(u.id, (await activeThread(u.id)).id, { message: "hi" });

  beforeAll(async () => {
    u = await createTestUser("coach2-tools");
    ({ today } = await seedUser(admin(), u.id, { days: 10 }));
    await addKey(u.id);
    await logMeal(u.id, today, "Salmon onigiri", { kcal: 600, protein_g: 35, carbs_g: 80, fat_g: 12 });
    await admin().from("activities").insert({
      user_id: u.id, garmin_activity_id: 9_300_001, local_date: today, start_time: `${today}T07:00:00Z`, type_key: "running", name: "Threshold",
      distance_m: 4000, duration_s: 1300, moving_s: 1280, avg_hr: 172, max_hr: 186,
      splits: { lapDTOs: [{ distance: 2000, duration: 700, averageHR: 165 }, { distance: 2000, duration: 580, averageHR: 178 }] },
    });
  });
  afterAll(cleanup);

  it("food_log returns meals and targets for the day", async () => {
    const out = await runReadTool(await ctx(), "food_log", { from: today, to: today });
    expect(out).toContain("Salmon onigiri");
    expect(out).toMatch(/protein \d+ g/);
    expect(out).toContain("Targets (today)");
  });

  it("session returns laps and heart rate of the day's activity", async () => {
    const out = await runReadTool(await ctx(), "session", { date: today });
    expect(out).toContain("lap 2: 2 km");
    expect(out).toContain("HR 178");
  });

  it("health tools are left out without consent", async () => {
    const cc = await ctx();
    expect(readTools(cc).map((t) => t.name)).not.toContain("recovery");
    expect(readTools(cc).map((t) => t.name)).not.toContain("findings");
    expect(await runReadTool(cc, "recovery", { from: today, to: today })).toContain("health data is off");
  });

  it("ranges are capped at 31 days", async () => {
    const out = await runReadTool(await ctx(), "food_log", { from: addDays(today, -365), to: today });
    expect(out).toContain("capped to 31 days");
    expect(out.split("\n").filter((l) => /^\d{4}-\d{2}-\d{2} /.test(l))).toHaveLength(31);
  });

  it("the loop runs a read tool and feeds the result back", async () => {
    ai.script = [() => tool("food_log", { from: today, to: today }), () => tool("reply", { message: "You have had onigiri.", options: [] })];
    const r = await runCoach(u.id, { text: "what did I eat?" }, { ai });
    expect(r.ok && r.message.text).toBe("You have had onigiri.");
    expect(JSON.stringify(ai.calls[1]!.messages.at(-1))).toContain("Salmon onigiri");
  });
});

describe("coach v2: streaming", () => {
  let u: TestUser;
  let today: string;
  const ai = new FakeCoach();
  const read = async (res: Response) => {
    const events: CoachEvent[] = [];
    const text = await res.text();
    for (const line of text.split("\n").filter(Boolean)) events.push(JSON.parse(line));
    return events;
  };
  /** Quotes and a line break: the model's JSON escapes them, the live text must not. */
  const SHOYU = 'Have a "shoyu" ramen\nwith an extra egg tonight.';
  /** A reply written in pieces 150 ms apart, as the model streams its JSON (escapes included). */
  const streamedReply = (message: string) => async (_p: unknown, opts?: { onReplyDelta?: (j: string) => void }) => {
    const json = JSON.stringify({ message, options: [] });
    for (const cut of [25, 50, json.length]) {
      opts?.onReplyDelta?.(json.slice(0, cut));
      await new Promise((r) => setTimeout(r, 150));
    }
    return tool("reply", { message, options: [] });
  };

  beforeAll(async () => {
    u = await createTestUser("coach2-stream");
    ({ today } = await seedUser(admin(), u.id, { days: 5 }));
    await addKey(u.id);
  });
  afterAll(cleanup);

  it("the stream sends status, growing text and done", async () => {
    ai.script = [() => tool("food_log", { from: today, to: today }), streamedReply(SHOYU)];
    const res = await coachResponse(u.id, { text: "dinner?" }, { ai });
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await read(res);
    expect(events).toContainEqual({ type: "status", label: TOOL_LABELS.food_log });
    const texts = events.filter((e): e is Extract<CoachEvent, { type: "text" }> => e.type === "text").map((e) => e.text);
    expect(texts.length).toBeGreaterThanOrEqual(2);
    expect(texts.at(-1)!.length).toBeGreaterThan(texts[0]!.length);
    // The reply's JSON escapes come out decoded in the live text.
    expect(texts.at(-1)).toBe(SHOYU);
    const done = events.at(-1)!;
    expect(done.type === "done" && done.message.text).toBe(SHOYU);
  });

  it("an aborted stream still stores the answer", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    ai.script = [async (p, o) => {
      await gate;
      return streamedReply("Stored even though you left.")(p, o);
    }];
    const res = await coachResponse(u.id, { text: "still there?" }, { ai });
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    release();
    for (let i = 0; i < 50 && !(await recentMessages((await activeThread(u.id)).id, 1))[0]?.text.startsWith("Stored"); i++) await new Promise((r) => setTimeout(r, 100));
    expect((await recentMessages((await activeThread(u.id)).id, 1))[0]!.text).toBe("Stored even though you left.");
  });

  it("a second message while one is running is busy", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    ai.script = [async (p, o) => {
      await gate;
      return streamedReply("first")(p, o);
    }];
    const first = await coachResponse(u.id, { text: "one" }, { ai });
    const second = await coachResponse(u.id, { text: "two" }, { ai });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "busy" });
    release();
    await read(first);
  });
});

describe("coach v2: robustness", () => {
  const ai = new FakeCoach();
  afterAll(cleanup);

  it("answers even when the food targets can't be read (onboarding not finished)", async () => {
    const u = await createTestUser("coach2-bare");
    await addKey(u.id);
    ai.script = [() => tool("reply", { message: "Happy to help.", options: [] })];
    const r = await runCoach(u.id, { text: "hi" }, { ai });
    expect(r.ok && r.message.text).toBe("Happy to help.");
    expect(ctxOf(ai.calls.at(-1)!)).toContain("Today's intake: not available right now");
  });

  it("findings: the strongest first, AI questions that haven't passed stay out", async () => {
    const u = await createTestUser("coach2-findings");
    const { today } = await seedUser(admin(), u.id, { days: 3 });
    await admin().from("profiles").update({ ai_health_consent: true, ai_health_consent_at: new Date().toISOString() }).eq("user_id", u.id);
    const g = (n: number, mean: number, bound: number | null) => ({ n, mean, bound });
    const row = (question_id: string, factor: string, outcome: string, kind: string, source: string, effect_sd: number | null) => ({
      user_id: u.id, computed_at: new Date().toISOString(), question_id, factor, outcome, lag: 1, kind, source, effect_sd,
      groups: { high: g(20, kind === "finding" ? -4 : 0, 800), low: g(20, 2, 250), needed: 8 },
    });
    await admin().from("recovery_findings").insert([
      row("deficit-hrv", "deficit", "hrv", "finding", "engine", -0.6),
      row("alcohol-sleep", "alcohol", "sleepScore", "finding", "engine", -0.9),
      row("ai-steps", "steps", "hrv", "needs_data", "ai", null),
      row("rest-run", "daysSinceHard", "runForm", "needs_data", "engine", null),
    ]);
    const cc = await buildCoachContext(u.id, (await activeThread(u.id)).id, { message: "hi" });
    const out = await runReadTool(cc, "findings", {});
    expect(out.indexOf("alcohol ≥")).toBeLessThan(out.indexOf("deficit ≥"));
    expect(out).toContain("deficit ≥ 800 kcal vs ≤ 250 kcal → hrv");
    expect(out).toContain("daysSinceHard → runForm");
    expect(out).not.toContain("steps → hrv");
    expect(today).toBeTruthy();
  });
});
