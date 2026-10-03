import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { PLAN_SYSTEM_PROMPT, PlanAdjustSchema, type PlanAdjust } from "@loop/core";
import type { TokenUsage } from "./pricing";

export const PLAN_MODEL = process.env.AI_PLAN_MODEL ?? "claude-opus-5-5";
const EFFORT = (process.env.AI_PLAN_EFFORT ?? "high") as "low" | "medium" | "high" | "xhigh" | "max";

export type AdjustError = "invalid_key" | "unavailable" | "refused" | "invalid_output";

export type AdjustOutcome =
  | { ok: true; result: PlanAdjust; usage: TokenUsage; model: string }
  | { ok: false; error: AdjustError; usage: TokenUsage; model: string };

function read(res: Anthropic.Message): PlanAdjust | null {
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return null;
  try {
    const parsed = PlanAdjustSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Asks Claude for plan edits (structured). The engine validates them afterwards. */
export async function adjustPlan(apiKey: string, message: string): Promise<AdjustOutcome> {
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const done = (r: { ok: true; result: PlanAdjust } | { ok: false; error: AdjustError }): AdjustOutcome => ({ ...r, usage, model: PLAN_MODEL });

  let res: Anthropic.Message;
  try {
    res = await client.messages.create({
      model: PLAN_MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: PLAN_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: message }],
      output_config: { effort: EFFORT, format: zodOutputFormat(PlanAdjustSchema) },
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return done({ ok: false, error: "invalid_key" });
    return done({ ok: false, error: "unavailable" });
  }
  usage.input += res.usage.input_tokens;
  usage.output += res.usage.output_tokens;
  usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
  usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;

  if (res.stop_reason === "refusal") return done({ ok: false, error: "refused" });
  const result = res.stop_reason === "max_tokens" ? null : read(res);
  return result ? done({ ok: true, result }) : done({ ok: false, error: "invalid_output" });
}
