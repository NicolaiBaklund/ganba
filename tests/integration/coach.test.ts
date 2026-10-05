import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, weekday } from "@loop/core";
import { encryptSecret } from "@/lib/ai/crypto";
import type { CoachAi, CoachParams, CoachResponse } from "@/lib/ai/coach";
import { saveTokens } from "@/lib/garmin/accounts";
import { syncGarmin } from "@/lib/garmin/sync";
import { setAiHealthConsent } from "@/lib/recovery/consent";
import { runCoach } from "@/lib/coach/run";
import { applyOption } from "@/lib/coach/apply";
import { activeThread, addMessage, archiveThread, listNotes } from "@/lib/coach/store";
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

  it("a session far ahead can be asked about (it is always in the coach's view)", async () => {
    const plan = await activePlan(u.id);
    const far = (await planWorkouts(plan!.id)).find((w) => w.date > addDays(today, 40) && w.status === "planned")!;
    ai.script = [() => tool("reply", { message: "ok", options: [] })];
    await runCoach(u.id, { text: "make this one shorter", aboutWorkoutId: far.id }, { ai });
    const ctxText = String((ai.calls.at(-1)!.messages[0] as { content: string }).content);
    const ref = ctxText.match(/asking about session (s\d+)/)?.[1];
    expect(ref).toBeTruthy();
    expect(ctxText).toMatch(new RegExp(`^${ref} \\| ${far.date} `, "m"));
  });

  it("too many rounds: the last one asks for a reply, and the runner still gets an answer", async () => {
    ai.script = Array.from({ length: 6 }, () => () => tool("check_plan_changes", { changes: [] }));
    const r = await runCoach(u.id, { text: "think hard" }, { ai });
    expect(r.ok).toBe(true);
    expect(r.ok && r.message.text.length).toBeGreaterThan(0);
    const last = ai.calls.at(-1)!.messages.at(-1) as { content: { type: string; text?: string }[] };
    expect(last.content.some((b) => b.type === "text" && /final round/i.test(b.text ?? ""))).toBe(true);
  });

  it("retry after a failure does not store the message twice", async () => {
    ai.script = [];
    expect((await runCoach(u.id, { text: "same question" }, { ai })).ok).toBe(false);
    ai.script = [() => tool("reply", { message: "answer", options: [] })];
    expect((await runCoach(u.id, { text: "same question" }, { ai })).ok).toBe(true);
    const { data } = await admin().from("coach_messages").select("id").eq("user_id", u.id).eq("text", "same question");
    expect(data).toHaveLength(1);
  });

  it("an AI failure keeps the conversation usable", async () => {
    ai.script = [];
    expect((await runCoach(u.id, { text: "hello?" }, { ai })).ok).toBe(false);
    const plan = await activePlan(u.id);
    expect((await planWorkouts(plan!.id)).length).toBeGreaterThan(0);
  });
});

describe("coach: applying options", () => {
  let u: TestUser;
  let today: string;
  const ai = new FakeCoach();
  const garmin = new FakeGarmin();

  beforeAll(async () => {
    u = await createTestUser("coach-apply");
    ({ today } = await seedUser(admin(), u.id, { days: 20 }));
    for (let d = 28; d >= 1; d--) {
      const date = addDays(today, -d);
      if ([2, 4].includes(weekday(date))) garmin.activities.push(run(date, 7));
      if (weekday(date) === 0) garmin.activities.push(run(date, 12));
    }
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
    await syncGarmin(u.id, { source: garmin });
    await createPlan(u.id, { goal: { kind: "build" }, weekdays: [2, 4, 0], longRunWeekday: 0, runsPerWeek: 3 });
    const enc = encryptSecret("sk-ant-test-0000000000000000");
    await admin().from("api_keys").insert({ user_id: u.id, provider: "anthropic", ciphertext: enc.ciphertext, iv: enc.iv, auth_tag: enc.authTag, last4: "0000" });
  });
  afterAll(cleanup);

  const askFor = async (options: (p: CoachParams) => unknown[]) => {
    ai.script = [(p) => tool("reply", { message: "Here you go", options: options(p) })];
    const r = await runCoach(u.id, { text: "please" }, { ai });
    if (!r.ok) throw new Error(r.error);
    return r.message;
  };

  it("applying saves the sessions, marks them for the watch, and the other option becomes not used", async () => {
    const m = await askFor((p) => [
      { title: "Longer easy", summary: "", changes: [{ op: "edit", session: refFor(p, "easy"), steps: [{ kind: "run", km: 10 }] }] },
      { title: "Extra run", summary: "", changes: [{ op: "add", date: addDays(today, 2), type: "easy", steps: [{ kind: "run", km: 5 }] }] },
    ]);
    expect(m.options[0]!.lines.join(" ")).toMatch(/km → .*km/);
    expect(m.options[1]!.lines.join(" ")).toMatch(/^New: /);
    expect(await applyOption(u.id, m.id, m.options[1]!.id)).toEqual({ ok: true });
    const plan = await activePlan(u.id);
    const ws = await planWorkouts(plan!.id);
    const added = ws.find((w) => w.date === addDays(today, 2) && Number(w.planned_km) === 5);
    expect(added?.garmin_push_status).toBe("pending");
    const { data } = await admin().from("coach_messages").select("options").eq("id", m.id).single();
    expect((data!.options as { status: string }[]).map((o) => o.status)).toEqual(["not_used", "applied"]);
  });

  it("if the plan changed meanwhile and the warnings differ, it asks again; confirm applies", async () => {
    const m = await askFor((p) => [{ title: "Long run tomorrow", summary: "", changes: [{ op: "move", session: refFor(p, "long"), toDate: addDays(today, 1) }] }]);
    // Meanwhile a hard session lands the day before.
    const plan = await activePlan(u.id);
    const ws = await planWorkouts(plan!.id);
    const quality = ws.find((w) => ["intervals", "threshold", "tempo"].includes(w.type) && w.date > today)!;
    await admin().from("planned_workouts").update({ date: today }).eq("id", quality.id);
    const first = await applyOption(u.id, m.id, m.options[0]!.id);
    expect(first.ok).toBe(false);
    expect(!first.ok && first.error).toBe("changed");
    expect(!first.ok && first.warnings!.some((w) => w.code === "hard_back_to_back")).toBe(true);
    expect(await applyOption(u.id, m.id, m.options[0]!.id, { confirm: true })).toEqual({ ok: true });
  });

  it("all or nothing: an option where a change no longer applies is never applied in part", async () => {
    const m = await askFor((p) => [
      {
        title: "Two changes",
        summary: "",
        changes: [
          { op: "edit", session: refFor(p, "easy"), steps: [{ kind: "run", km: 7 }] },
          { op: "add", date: addDays(today, 3), type: "easy", steps: [{ kind: "run", km: 4 }] },
        ],
      },
    ]);
    const easyId = (m.options[0]!.changes[0] as { workoutId: string }).workoutId;
    await admin().from("planned_workouts").update({ status: "done" }).eq("id", easyId);
    const r1 = await applyOption(u.id, m.id, m.options[0]!.id);
    expect(!r1.ok && r1.error).toBe("invalid");
    const r2 = await applyOption(u.id, m.id, m.options[0]!.id, { confirm: true });
    expect(r2.ok).toBe(false);
    const plan = await activePlan(u.id);
    expect((await planWorkouts(plan!.id)).some((w) => w.date === addDays(today, 3) && Number(w.planned_km) === 4)).toBe(false);
    await admin().from("planned_workouts").update({ status: "planned" }).eq("id", easyId);
  });

  it("confirm only applies what was shown: a second change in between asks again", async () => {
    const m = await askFor((p) => [{ title: "Long run sooner", summary: "", changes: [{ op: "move", session: refFor(p, "long"), toDate: addDays(today, 4) }] }]);
    const plan = await activePlan(u.id);
    const ws = await planWorkouts(plan!.id);
    const easy = ws.find((w) => w.type === "easy" && w.status === "planned" && w.date > today)!;
    await admin().from("planned_workouts").update({ date: addDays(today, 3), type: "threshold" }).eq("id", easy.id);
    const first = await applyOption(u.id, m.id, m.options[0]!.id);
    expect(!first.ok && first.error).toBe("changed");
    await admin().from("planned_workouts").update({ date: addDays(today, 5), type: "intervals" }).eq("id", easy.id);
    const second = await applyOption(u.id, m.id, m.options[0]!.id, { confirm: true });
    expect(!second.ok && second.error).toBe("changed");
  });

  it("two taps at once: only one option is applied", async () => {
    const m = await askFor((p) => [
      { title: "A", summary: "", changes: [{ op: "add", date: addDays(today, 6), type: "easy", steps: [{ kind: "run", km: 3.3 }] }] },
      { title: "B", summary: "", changes: [{ op: "add", date: addDays(today, 6), type: "easy", steps: [{ kind: "run", km: 3.7 }] }] },
    ]);
    const rs = await Promise.all([applyOption(u.id, m.id, m.options[0]!.id), applyOption(u.id, m.id, m.options[1]!.id)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    const plan = await activePlan(u.id);
    expect((await planWorkouts(plan!.id)).filter((w) => w.date === addDays(today, 6) && [3.3, 3.7].includes(Number(w.planned_km)))).toHaveLength(1);
  });

  it("options in an archived conversation cannot be applied", async () => {
    const m = await askFor((p) => [{ title: "Old", summary: "", changes: [{ op: "edit", session: refFor(p, "easy"), steps: [{ kind: "run", km: 9 }] }] }]);
    await archiveThread(u.id);
    const r = await applyOption(u.id, m.id, m.options[0]!.id);
    expect(!r.ok && r.error).toBe("archived");
  });

  it("an applied option cannot be applied twice", async () => {
    const m = await askFor((p) => [{ title: "Shorter easy", summary: "", changes: [{ op: "edit", session: refFor(p, "easy"), steps: [{ kind: "run", km: 6 }] }] }]);
    expect((await applyOption(u.id, m.id, m.options[0]!.id)).ok).toBe(true);
    expect(await applyOption(u.id, m.id, m.options[0]!.id)).toEqual({ ok: false, error: "not_pending" });
  });
});
