import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, weekday } from "@loop/core";
import { encryptSecret } from "@/lib/ai/crypto";
import type { CoachAi, CoachParams, CoachResponse } from "@/lib/ai/coach";
import { saveTokens } from "@/lib/garmin/accounts";
import { syncGarmin } from "@/lib/garmin/sync";
import { setAiHealthConsent } from "@/lib/recovery/consent";
import { runCoach } from "@/lib/coach/run";
import { activeThread, addMessage, listNotes } from "@/lib/coach/store";
import { activePlan, createPlan, planWorkouts } from "@/lib/training/service";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";
import { FakeGarmin, run } from "./fake-garmin";

type Step = (p: CoachParams) => CoachResponse;
class FakeCoach implements CoachAi {
  calls: CoachParams[] = [];
  script: Step[] = [];
  async create(_k: string, p: CoachParams) {
    this.calls.push(JSON.parse(JSON.stringify(p)));
    const s = this.script.shift();
    if (!s) throw Object.assign(new Error("no script"), { status: 500 });
    return s(p);
  }
}
const usage = { input_tokens: 100, output_tokens: 20 };
const tool = (name: string, input: unknown, id = `t-${name}-${Math.random()}`): CoachResponse => ({
  content: [{ type: "tool_use", id, name, input, caller: { type: "direct" } } as never],
  stop_reason: "tool_use",
  usage,
});
/** "sN" ref of the first upcoming session of a type, read from the context the coach got. */
const refFor = (p: CoachParams, type: string) => {
  const text = String((p.messages[0] as { content: string }).content);
  return text.match(new RegExp(`^(s\\d+) \\| \\S+ \\S+ \\| ${type} \\|`, "m"))![1]!;
};

describe("coach: tool loop, options, memory, consent", () => {
  let u: TestUser;
  let today: string;
  const ai = new FakeCoach();
  const garmin = new FakeGarmin();

  beforeAll(async () => {
    u = await createTestUser("coach");
    ({ today } = await seedUser(admin(), u.id, { days: 20 }));
    for (let d = 28; d >= 1; d--) {
      const date = addDays(today, -d);
      const wd = weekday(date);
      if (wd === 2 || wd === 4) garmin.activities.push(run(date, 7));
      if (wd === 0) garmin.activities.push(run(date, 12));
    }
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
    await syncGarmin(u.id, { source: garmin });
    let race = addDays(today, 63);
    while (weekday(race) !== 6) race = addDays(race, 1);
    await createPlan(u.id, { goal: { kind: "race", distance: "10k", raceDate: race }, weekdays: [2, 4, 0], longRunWeekday: 0, runsPerWeek: 3 });
    const enc = encryptSecret("sk-ant-test-0000000000000000");
    await admin().from("api_keys").insert({ user_id: u.id, provider: "anthropic", ciphertext: enc.ciphertext, iv: enc.iv, auth_tag: enc.authTag, last4: "0000" });
  });
  afterAll(cleanup);

  it("checks, then replies with options carrying the engine's warnings; a bad option is left out and mentioned", async () => {
    ai.script = [
      (p) => tool("check_plan_changes", { changes: [{ op: "edit", session: refFor(p, "intervals"), steps: [{ kind: "warmup", km: 3 }, { repeat: 5, steps: [{ kind: "run", km: 1, zone: "interval" }, { kind: "recover", minutes: 2 }] }, { kind: "cooldown", km: 1.5 }] }] }),
      (p) => {
        const result = JSON.stringify((p.messages.at(-1) as { content: { content: string }[] }).content[0]!.content);
        expect(result).toContain("weeks");
        return tool("reply", {
          message: "Done: warm-up is 3 km now.",
          options: [
            { title: "Longer warm-up", summary: "3 km warm-up", changes: [{ op: "edit", session: refFor(p, "intervals"), steps: [{ kind: "warmup", km: 3 }, { repeat: 5, steps: [{ kind: "run", km: 1, zone: "interval" }, { kind: "recover", minutes: 2 }] }, { kind: "cooldown", km: 1.5 }] }] },
            { title: "Tiny run", summary: "too short to be a session", changes: [{ op: "edit", session: refFor(p, "easy"), steps: [{ kind: "run", km: 0.5 }] }] },
          ],
        });
      },
    ];
    const r = await runCoach(u.id, { text: "Make the warm-up on the interval session 1 km longer" }, { ai });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message.options).toHaveLength(1);
    expect(r.message.options[0]!.changes[0]!.op).toBe("edit");
    expect(r.message.text).toContain("left out");
    expect(ai.calls[0]!.tools.map((t) => t.name)).toEqual(["check_plan_changes", "update_notes", "reply"]);
  });

  it("text without reply is stored as the answer; notes tool remembers lasting facts", async () => {
    ai.script = [
      () => tool("update_notes", { add: [{ text: "Sore left calf since today", until: addDays(today, 14) }] }),
      () => ({ content: [{ type: "text", text: "Take it easy this week.", citations: null } as never], stop_reason: "end_turn", usage }),
    ];
    const r = await runCoach(u.id, { text: "My calf is sore" }, { ai });
    expect(r.ok && r.message.text).toBe("Take it easy this week.");
    expect((await listNotes(u.id, today)).map((n) => n.text)).toContain("Sore left calf since today");
  });

  it("the context stays small: 12 latest messages, recovery only with consent", async () => {
    const thread = await activeThread(u.id);
    for (let i = 0; i < 20; i++) await addMessage(u.id, thread.id, { role: i % 2 ? "coach" : "user", text: `old message ${i}` });
    ai.script = [() => tool("reply", { message: "ok", options: [] })];
    await runCoach(u.id, { text: "hi" }, { ai });
    const ctxText = String((ai.calls.at(-1)!.messages[0] as { content: string }).content);
    expect(ctxText.match(/^\[(user|coach)\]/gm)).toHaveLength(12);
    expect(ctxText).not.toContain("old message 7");
    expect(ctxText).not.toContain("Recovery (last 7 mornings");
    await setAiHealthConsent(u.id, true);
    ai.script = [() => tool("reply", { message: "ok", options: [] })];
    await runCoach(u.id, { text: "hi again" }, { ai });
    expect(String((ai.calls.at(-1)!.messages[0] as { content: string }).content)).toContain("Recovery (last 7 mornings");
  });

  it("one reply at a time per conversation", async () => {
    const thread = await activeThread(u.id);
    await admin().from("coach_threads").update({ busy_until: new Date(Date.now() + 60_000).toISOString() }).eq("id", thread.id);
    const n = ai.calls.length;
    expect(await runCoach(u.id, { text: "again" }, { ai })).toEqual({ ok: false, error: "busy" });
    expect(ai.calls.length).toBe(n);
    await admin().from("coach_threads").update({ busy_until: null }).eq("id", thread.id);
  });

  it("an AI failure keeps the conversation usable", async () => {
    ai.script = [];
    expect((await runCoach(u.id, { text: "hello?" }, { ai })).ok).toBe(false);
    const plan = await activePlan(u.id);
    expect((await planWorkouts(plan!.id)).length).toBeGreaterThan(0);
  });
});
