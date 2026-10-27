import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, weekday } from "@loop/core";
import { encryptSecret } from "@/lib/ai/crypto";
import { applyOption, dismissOptions } from "@/lib/coach/apply";
import { runCoach } from "@/lib/coach/run";
import { addNotes, activeThread, listNotes, recentMessages } from "@/lib/coach/store";
import { createPlan, planWorkouts, activePlan } from "@/lib/training/service";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";
import { FakeCoach, ctxOf, tool, usage } from "./fake-coach";

describe("coach v3: streaming, meta, preview cells, memory", () => {
  let u: TestUser;
  let today: string;
  const ai = new FakeCoach();

  beforeAll(async () => {
    u = await createTestUser("coach3");
    ({ today } = await seedUser(admin(), u.id, { days: 10 }));
    const enc = encryptSecret("sk-ant-test-0000000000000000");
    await admin().from("api_keys").insert({ user_id: u.id, provider: "anthropic", ciphertext: enc.ciphertext, iv: enc.iv, auth_tag: enc.authTag, last4: "0000" });
    await createPlan(u.id, { goal: { kind: "build" }, weekdays: [0, 1, 2, 3, 4, 5, 6], longRunWeekday: 0, runsPerWeek: 4 });
  });
  afterAll(cleanup);

  it("the reply tool streams eagerly", async () => {
    ai.script = [() => tool("reply", { message: "ok", options: [] })];
    await runCoach(u.id, { text: "hi" }, { ai });
    const reply = ai.calls.at(-1)!.tools.find((t) => t.name === "reply") as { eager_input_streaming?: boolean };
    expect(reply.eager_input_streaming).toBe(true);
  });

  it("a coach message stores the tools it used and what it remembered or forgot", async () => {
    await addNotes(u.id, [{ text: "Sick since Monday", until: addDays(today, 7) }], "coach");
    const sick = (await listNotes(u.id, today)).find((n) => n.text === "Sick since Monday")!;
    ai.script = [
      () => tool("food_log", { from: today, to: today }),
      () => tool("update_notes", { add: [{ text: "Lives in Tokyo" }], remove: [sick.id] }),
      () => tool("reply", { message: "Noted.", options: [] }),
    ];
    const r = await runCoach(u.id, { text: "I'm better now, and I live in Tokyo" }, { ai });
    const meta = { tools: ["food_log", "update_notes"], remembered: ["Lives in Tokyo"], forgot: ["Sick since Monday"] };
    expect(r.ok && r.message.meta).toEqual(meta);
    const stored = (await recentMessages((await activeThread(u.id)).id, 1))[0]!;
    expect(stored.meta).toEqual(meta);
  });

  it("the memory line shows what was stored, not the model's raw text", async () => {
    const long = `  ${"Prefers runs before work. ".repeat(12)}  `;
    ai.script = [() => tool("update_notes", { add: [{ text: long }, { text: "   " }], remove: [] }), () => tool("reply", { message: "ok", options: [] })];
    const r = await runCoach(u.id, { text: "remember this" }, { ai });
    const stored = (await listNotes(u.id, today)).map((n) => n.text);
    expect(r.ok && r.message.meta.remembered).toEqual([long.trim().slice(0, 200)]);
    expect(stored).toContain(long.trim().slice(0, 200));
  });

  it("temporary notes are marked in the context", async () => {
    await addNotes(u.id, [{ text: "Knee sore", until: addDays(today, 5) }], "user");
    ai.script = [() => tool("reply", { message: "ok", options: [] })];
    await runCoach(u.id, { text: "hi" }, { ai });
    expect(ctxOf(ai.calls.at(-1)!)).toContain(`Knee sore (temporary, until ${addDays(today, 5)})`);
  });

  it("preview cells carry what a bib needs, and where a moved session came from", async () => {
    const plan = (await activePlan(u.id))!;
    const easy = (await planWorkouts(plan.id)).find((w) => w.type === "easy" && w.status === "planned" && w.date > today)!;
    const to = [1, 2, 3].map((n) => addDays(easy.date, n)).find((d) => weekday(d) !== 1)!;
    ai.script = [
      (p) => {
        const ref = ctxOf(p).match(new RegExp(`^(s\\d+) \\| ${easy.date} `, "m"))![1]!;
        return tool("reply", { message: "Moved.", options: [{ title: "Easy run later", summary: "", changes: [{ op: "move", session: ref, toDate: to }] }] });
      },
    ];
    const r = await runCoach(u.id, { text: "move my easy run" }, { ai });
    const days = r.ok ? r.message.options[0]!.weeks!.flatMap((w) => w.days) : [];
    const cell = days.find((d) => d.date === to)!.after.find((c) => c.title === easy.title)!;
    expect(cell).toMatchObject({ title: easy.title, fromDate: easy.date });
    expect(cell.durationS).toBeGreaterThan(0);
  });

  it("Not now turns down the reply's open options; they can't be applied after, and the coach sees it", async () => {
    const plan = (await activePlan(u.id))!;
    const easy = (await planWorkouts(plan.id)).find((w) => w.type === "easy" && w.status === "planned" && w.date > today)!;
    ai.script = [
      (p) => {
        const ref = ctxOf(p).match(new RegExp(`^(s\\d+) \\| ${easy.date} `, "m"))![1]!;
        return tool("reply", {
          message: "Two ways.",
          options: [
            { title: "Shorter easy run", summary: "", changes: [{ op: "edit", session: ref, steps: [{ kind: "run", km: 3, zone: "easy" }] }] },
            { title: "Longer easy run", summary: "", changes: [{ op: "edit", session: ref, steps: [{ kind: "run", km: 9, zone: "easy" }] }] },
          ],
        });
      },
    ];
    const r = await runCoach(u.id, { text: "change my easy run" }, { ai });
    const m = r.ok ? r.message : null!;
    expect(await dismissOptions(u.id, m.id)).toEqual({ ok: true });
    const stored = (await recentMessages((await activeThread(u.id)).id, 1))[0]!;
    expect(stored.options.map((o) => o.status)).toEqual(["dismissed", "dismissed"]);
    const late = await applyOption(u.id, m.id, m.options[0]!.id);
    expect(!late.ok && late.error).toBe("not_pending");
    expect((await planWorkouts(plan.id)).find((w) => w.id === easy.id)!.planned_km).toBe(easy.planned_km);

    ai.script = [() => tool("reply", { message: "ok", options: [] })];
    await runCoach(u.id, { text: "fine" }, { ai });
    expect(ctxOf(ai.calls.at(-1)!)).toContain("Shorter easy run (dismissed)");
  });

  it("a cut-off reply is never applied", async () => {
    ai.script = [
      () => ({
        content: [{ type: "tool_use", id: "t-cut", name: "reply", input: { message: "Half an ans" }, caller: { type: "direct" } } as never],
        stop_reason: "max_tokens",
        usage,
      }),
    ];
    const r = await runCoach(u.id, { text: "long question" }, { ai });
    expect(r.ok && r.message.options).toEqual([]);
    expect(r.ok && r.message.text).toContain("cut off");
  });
});
