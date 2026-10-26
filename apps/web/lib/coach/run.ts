import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { checkChanges, weekPreview, COACH_PROMPT_VERSION, COACH_SYSTEM_PROMPT, CoachChangeSchema, describeChanges, toProposalChange, type ProposalChange } from "@loop/core";
import { resolveAnthropicKey } from "@/lib/ai/keys";
import { costUsd } from "@/lib/ai/pricing";
import { anthropicCoachAi, COACH_MODEL, type CoachAi } from "@/lib/ai/coach";
import { buildCoachContext, type CoachContext } from "./context";
import { isReadTool, readTools, runReadTool } from "./tools";
import { activeThread, addMessage, addNotes, claimThread, recentMessages, releaseThread, removeNotes, type CoachMessage, type CoachOption } from "./store";

/** Fetching data costs rounds: room for a few reads, a plan check and the reply. */
export const MAX_ROUNDS = 10;
export const MAX_OPTIONS = 3;
/** Whole turn, well inside the route's 300 s; the last call gets what is left. */
const DEADLINE_MS = 240_000;
const FINAL_NUDGE = "Final round: call reply now with what you have.";
const GAVE_UP = "I couldn't finish working that out. Ask again, maybe a bit shorter.";
const CUT_OFF = "(My answer was cut off. Ask again if something is missing.)";
export type CoachError = "no_key" | "busy" | "invalid_key" | "unavailable" | "refused" | "invalid_output";

const CheckInput = z.object({ changes: z.array(CoachChangeSchema) });
const NotesInput = z.object({
  add: z.array(z.object({ text: z.string(), until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "until must be YYYY-MM-DD").nullable().optional() })).default([]),
  remove: z.array(z.string()).default([]),
});
const ReplyInput = z.object({
  message: z.string(),
  options: z.array(z.object({ title: z.string(), summary: z.string(), changes: z.array(CoachChangeSchema) })).default([]),
});

const schema = (s: z.ZodType) => z.toJSONSchema(s) as Anthropic.Tool["input_schema"];
const PLAN_TOOL: Anthropic.Tool = {
  name: "check_plan_changes",
  description: "Dry-run changes in the plan engine. Returns which changes are allowed, errors, new load warnings and weekly km before/after. Use before proposing.",
  input_schema: schema(CheckInput),
};
const BASE_TOOLS: Anthropic.Tool[] = [
  {
    name: "update_notes",
    description: "Add or remove coach notes (lasting facts about the person). Max 15; give temporary facts an until date (YYYY-MM-DD).",
    input_schema: schema(NotesInput),
  },
  {
    name: "reply",
    description: "Finish the turn: your message to the runner and 0–3 options. Each option is a complete set of plan changes applied with one tap (none without a plan).",
    input_schema: schema(ReplyInput),
  },
];
/** The tools for this conversation: the read tools, plan changes only with a plan, notes and the reply. */
export const coachTools = (cc: CoachContext): Anthropic.Tool[] => [...readTools(cc), ...(cc.plan ? [PLAN_TOOL] : []), ...BASE_TOOLS];

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

/** Only called with a plan (the plan tool and options exist only then). */
function dryRun(cc: CoachContext, changes: z.infer<typeof CoachChangeSchema>[]) {
  const r = resolve(cc, changes);
  return { refErrors: r.errors, res: checkChanges(cc.workouts, r.ok, cc.ctx!, { recentLongestKm: cc.recentLongestKm }) };
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
export async function runCoach(userId: string, input: { text: string; aboutWorkoutId?: string | null; aboutDate?: string | null }, opts: { ai?: CoachAi } = {}) {
  const apiKey = await resolveAnthropicKey(userId);
  if (!apiKey) return { ok: false as const, error: "no_key" as CoachError };
  const thread = await activeThread(userId);
  if (!(await claimThread(thread.id))) return { ok: false as const, error: "busy" as CoachError };
  try {
    let cc = await buildCoachContext(userId, thread.id, { aboutWorkoutId: input.aboutWorkoutId, aboutDate: input.aboutDate, message: input.text });
    // A session id that is not in this plan (deleted, other plan) is ignored rather than failing.
    const aboutWorkoutId = input.aboutWorkoutId && cc.refOf.has(input.aboutWorkoutId) ? input.aboutWorkoutId : null;
    if (input.aboutWorkoutId && !aboutWorkoutId) cc = await buildCoachContext(userId, thread.id, { aboutDate: input.aboutDate, message: input.text });
    const tools = coachTools(cc);
    // A retry after a failed answer reuses the stored message instead of adding it again.
    const last = (await recentMessages(thread.id, 1))[0];
    if (!(last?.role === "user" && last.text === input.text))
      await addMessage(userId, thread.id, { role: "user", text: input.text, aboutWorkoutId });
    const started = Date.now();

    const ai = opts.ai ?? anthropicCoachAi;
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    // The context is cached, so later rounds in this turn read it from cache.
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: [{ type: "text", text: cc.text, cache_control: { type: "ephemeral" } }] }];
    let reply: z.infer<typeof ReplyInput> | null = null;
    let fallbackText = "";

    for (let round = 0; round < MAX_ROUNDS && !reply; round++) {
      const left = DEADLINE_MS - (Date.now() - started);
      if (left < 15_000) break;
      let res;
      try {
        res = await ai.create(apiKey, { system: COACH_SYSTEM_PROMPT, tools, messages }, { timeoutMs: left });
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
      const cutOff = res.stop_reason === "max_tokens";
      if (!uses.length || cutOff) {
        // A cut-off turn may hold half a tool call: never run it; keep the text and say so.
        const said = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
        fallbackText = cutOff ? [said, CUT_OFF].filter(Boolean).join("\n\n") : said;
        break;
      }
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const u of uses) {
        let out: unknown;
        if (u.name === "reply") {
          const p = ReplyInput.safeParse(u.input);
          if (p.success) reply = p.data;
          out = p.success ? "ok" : { is_error: true, error: "invalid reply", issues: p.error.issues.slice(0, 3) };
        } else if (u.name === "check_plan_changes" && cc.plan) {
          const p = CheckInput.safeParse(u.input);
          out = p.success ? check(cc, p.data.changes) : { is_error: true, error: "invalid input", issues: p.error.issues.slice(0, 3) };
        } else if (u.name === "update_notes") {
          const p = NotesInput.safeParse(u.input);
          if (!p.success) out = { is_error: true, error: "invalid input", issues: p.error.issues.slice(0, 3) };
          else {
            try {
              await removeNotes(userId, p.data.remove);
              await addNotes(userId, p.data.add, "coach");
              out = "saved";
            } catch (e) {
              out = { is_error: true, error: e instanceof Error ? e.message : "notes not saved" };
            }
          }
        } else if (isReadTool(u.name)) {
          out = await runReadTool(cc, u.name, u.input);
        } else out = { is_error: true, error: `unknown tool ${u.name}` };
        const isError = typeof out === "object" && out !== null && "is_error" in out;
        results.push({ type: "tool_result", tool_use_id: u.id, content: typeof out === "string" ? out : JSON.stringify(out), ...(isError ? { is_error: true } : {}) });
      }
      if (reply) break;
      // Next call is the last one (by rounds or time): ask for the answer now.
      const finalNext = round === MAX_ROUNDS - 2 || DEADLINE_MS - (Date.now() - started) < 60_000;
      messages.push({ role: "user", content: finalNext ? [...results, { type: "text", text: FINAL_NUDGE }] : results });
    }

    if (!reply && !fallbackText) fallbackText = GAVE_UP;
    const options: CoachOption[] = [];
    const dropped: string[] = [];
    // Options change the plan: none without one.
    const proposed = cc.plan ? (reply?.options ?? []) : [];
    const extra = Math.max(0, proposed.length - MAX_OPTIONS);
    for (const o of proposed.slice(0, MAX_OPTIONS)) {
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
        weeks: weekPreview(cc.workouts, res.after, res.weeks),
        status: "pending",
      });
    }
    const said = (reply?.message ?? fallbackText).trim() || (options.length ? "Here are some options." : GAVE_UP);
    const text = [
      said,
      ...dropped.map((t) => `(One option was left out because the app can't apply it: ${t}.)`),
      ...(extra ? [`(Only the first ${MAX_OPTIONS} options are shown.)`] : []),
    ].join("\n\n");
    const message = await addMessage(userId, thread.id, {
      role: "coach",
      text,
      options,
      usedHealth: cc.usedHealth,
      usage: { model: COACH_MODEL, input: usage.input + usage.cacheRead + usage.cacheWrite, output: usage.output, costUsd: costUsd(COACH_MODEL, usage), promptVersion: COACH_PROMPT_VERSION },
    });
    return { ok: true as const, message };
  } finally {
    await releaseThread(thread.id);
  }
}
