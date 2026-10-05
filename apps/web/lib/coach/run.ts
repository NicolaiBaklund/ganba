import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { checkChanges, COACH_PROMPT_VERSION, COACH_SYSTEM_PROMPT, CoachChangeSchema, describeChanges, toProposalChange, type ProposalChange } from "@loop/core";
import { resolveAnthropicKey } from "@/lib/ai/keys";
import { costUsd } from "@/lib/ai/pricing";
import { anthropicCoachAi, COACH_MODEL, type CoachAi } from "@/lib/ai/coach";
import { buildCoachContext, type CoachContext } from "./context";
import { activeThread, addMessage, addNotes, claimThread, recentMessages, releaseThread, removeNotes, type CoachMessage, type CoachOption } from "./store";

export const MAX_ROUNDS = 6;
export const MAX_OPTIONS = 3;
/** Whole turn, well inside the route's 300 s; the last call gets what is left. */
const DEADLINE_MS = 240_000;
const FINAL_NUDGE = "Final round: call reply now with what you have.";
const GAVE_UP = "I couldn't finish working that out. Ask again, maybe a bit shorter.";
export type CoachError = "no_plan" | "no_key" | "busy" | "invalid_key" | "unavailable" | "refused" | "invalid_output";

const CheckInput = z.object({ changes: z.array(CoachChangeSchema) });
const NotesInput = z.object({ add: z.array(z.object({ text: z.string(), until: z.string().nullable().optional() })).default([]), remove: z.array(z.string()).default([]) });
const ReplyInput = z.object({
  message: z.string(),
  options: z.array(z.object({ title: z.string(), summary: z.string(), changes: z.array(CoachChangeSchema) })).default([]),
});

const schema = (s: z.ZodType) => z.toJSONSchema(s) as Anthropic.Tool["input_schema"];
export const COACH_TOOLS: Anthropic.Tool[] = [
  {
    name: "check_plan_changes",
    description: "Dry-run changes in the plan engine. Returns which changes are allowed, errors, new load warnings and weekly km before/after. Use before proposing.",
    input_schema: schema(CheckInput),
  },
  {
    name: "update_notes",
    description: "Add or remove coach notes (lasting facts about the runner). Max 15; give temporary facts an until date (YYYY-MM-DD).",
    input_schema: schema(NotesInput),
  },
  {
    name: "reply",
    description: "Finish the turn: your message to the runner and 0–3 options. Each option is a complete set of changes applied with one tap.",
    input_schema: schema(ReplyInput),
  },
];

/** Changes from the model (refs) → engine changes; unknown refs become errors. */
function resolve(cc: CoachContext, changes: z.infer<typeof CoachChangeSchema>[]) {
  const ok: ProposalChange[] = [];
  const errors: string[] = [];
  for (const c of changes) {
    const r = toProposalChange(c, cc.refs);
    if ("error" in r) errors.push(r.error);
    else ok.push(r.change);
  }
  return { ok, errors };
}

function dryRun(cc: CoachContext, changes: z.infer<typeof CoachChangeSchema>[]) {
  const r = resolve(cc, changes);
  return { refErrors: r.errors, res: checkChanges(cc.workouts, r.ok, cc.ctx, { recentLongestKm: cc.recentLongestKm }) };
}

function check(cc: CoachContext, changes: z.infer<typeof CoachChangeSchema>[]) {
  const { refErrors, res } = dryRun(cc, changes);
  const r = { errors: refErrors };
  return {
    valid: res.valid,
    errors: [...r.errors, ...res.errors.map((e) => e.reason)],
    warnings: res.warnings,
    weeks: res.weeks,
    sessionsAfter: res.after
      .filter((w) => w.status === "planned" && w.date >= cc.today && res.weeks.some((wk) => w.date >= wk.monday && w.date < addWeek(wk.monday)))
      .map((w) => `${cc.refOf.get(w.id) ?? "new"} ${w.date} ${w.type} ${w.plannedKm} km`),
  };
}
const addWeek = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 7);
  return x.toISOString().slice(0, 10);
};

/** One user message → the coach's answer with checked options, stored in the active thread. */
export async function runCoach(userId: string, input: { text: string; aboutWorkoutId?: string | null }, opts: { ai?: CoachAi } = {}) {
  const apiKey = await resolveAnthropicKey(userId);
  if (!apiKey) return { ok: false as const, error: "no_key" as CoachError };
  const thread = await activeThread(userId);
  if (!(await claimThread(thread.id))) return { ok: false as const, error: "busy" as CoachError };
  try {
    const cc = await buildCoachContext(userId, thread.id, { aboutWorkoutId: input.aboutWorkoutId, message: input.text });
    if (!cc) return { ok: false as const, error: "no_plan" as CoachError };
    // A retry after a failed answer reuses the stored message instead of adding it again.
    const last = (await recentMessages(thread.id, 1))[0];
    if (!(last?.role === "user" && last.text === input.text))
      await addMessage(userId, thread.id, { role: "user", text: input.text, aboutWorkoutId: input.aboutWorkoutId });
    const started = Date.now();

    const ai = opts.ai ?? anthropicCoachAi;
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: cc.text }];
    let reply: z.infer<typeof ReplyInput> | null = null;
    let fallbackText = "";

    for (let round = 0; round < MAX_ROUNDS && !reply; round++) {
      const left = DEADLINE_MS - (Date.now() - started);
      if (left < 15_000) break;
      let res;
      try {
        res = await ai.create(apiKey, { system: COACH_SYSTEM_PROMPT, tools: COACH_TOOLS, messages }, { timeoutMs: left });
      } catch (e) {
        const status = (e as { status?: number }).status;
        return { ok: false as const, error: (status === 401 || status === 403 ? "invalid_key" : "unavailable") as CoachError };
      }
      usage.input += res.usage.input_tokens;
      usage.output += res.usage.output_tokens;
      usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
      usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;
      if (res.stop_reason === "refusal") return { ok: false as const, error: "refused" as CoachError };
      const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (!uses.length) {
        fallbackText = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
        break;
      }
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const u of uses) {
        let out: unknown;
        if (u.name === "reply") {
          const p = ReplyInput.safeParse(u.input);
          if (p.success) reply = p.data;
          out = p.success ? "ok" : { error: "invalid reply", issues: p.error.issues.slice(0, 3) };
        } else if (u.name === "check_plan_changes") {
          const p = CheckInput.safeParse(u.input);
          out = p.success ? check(cc, p.data.changes) : { error: "invalid input", issues: p.error.issues.slice(0, 3) };
        } else if (u.name === "update_notes") {
          const p = NotesInput.safeParse(u.input);
          if (p.success) {
            await removeNotes(userId, p.data.remove);
            await addNotes(userId, p.data.add, "coach");
          }
          out = p.success ? "saved" : { error: "invalid input" };
        } else out = { error: `unknown tool ${u.name}` };
        results.push({ type: "tool_result", tool_use_id: u.id, content: typeof out === "string" ? out : JSON.stringify(out) });
      }
      if (reply) break;
      // Next call is the last one (by rounds or time): ask for the answer now.
      const finalNext = round === MAX_ROUNDS - 2 || DEADLINE_MS - (Date.now() - started) < 60_000;
      messages.push({ role: "user", content: finalNext ? [...results, { type: "text", text: FINAL_NUDGE }] : results });
    }

    if (!reply && !fallbackText) fallbackText = GAVE_UP;
    const options: CoachOption[] = [];
    const dropped: string[] = [];
    for (const o of (reply?.options ?? []).slice(0, MAX_OPTIONS)) {
      const { refErrors, res } = dryRun(cc, o.changes);
      if (refErrors.length || res.errors.length || !res.valid.length) {
        dropped.push(o.title);
        continue;
      }
      options.push({
        id: randomUUID().slice(0, 8),
        title: o.title.slice(0, 80),
        summary: o.summary.slice(0, 400),
        changes: res.valid,
        lines: describeChanges(cc.workouts, res.after, res.valid),
        warnings: res.warnings,
        status: "pending",
      });
    }
    const text = [reply?.message ?? fallbackText, ...dropped.map((t) => `(One option was left out because the app can't apply it: ${t}.)`)].join("\n\n").trim();
    const message = await addMessage(userId, thread.id, {
      role: "coach",
      text,
      options,
      usage: { model: COACH_MODEL, input: usage.input + usage.cacheRead + usage.cacheWrite, output: usage.output, costUsd: costUsd(COACH_MODEL, usage), promptVersion: COACH_PROMPT_VERSION },
    });
    return { ok: true as const, message };
  } finally {
    await releaseThread(thread.id);
  }
}
