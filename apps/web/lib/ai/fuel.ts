import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { FUEL_SYSTEM_PROMPT, FuelAdviceSchema, type FuelAdvice } from "@loop/core";
import type { TokenUsage } from "./pricing";

export const FUEL_MODEL = process.env.AI_FUEL_MODEL ?? "claude-sonnet-5";
const EFFORT = (process.env.AI_FUEL_EFFORT ?? "low") as "low" | "medium" | "high";

export type FuelError = "invalid_key" | "unavailable" | "refused" | "invalid_output";

export type FuelOutcome =
  | { ok: true; advice: FuelAdvice; usage: TokenUsage; model: string }
  | { ok: false; error: FuelError; usage: TokenUsage; model: string };

/** Concrete food ideas for the fueling targets the rules already calculated. */
export async function suggestFuel(apiKey: string, message: string): Promise<FuelOutcome> {
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const done = (r: { ok: true; advice: FuelAdvice } | { ok: false; error: FuelError }): FuelOutcome => ({ ...r, usage, model: FUEL_MODEL });

  let res: Anthropic.Message;
  try {
    res = await client.messages.create({
      model: FUEL_MODEL,
      max_tokens: 4000,
      system: [{ type: "text", text: FUEL_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: message }],
      output_config: { effort: EFFORT, format: zodOutputFormat(FuelAdviceSchema) },
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
  if (res.stop_reason === "max_tokens") return done({ ok: false, error: "invalid_output" });

  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  try {
    const parsed = FuelAdviceSchema.safeParse(JSON.parse(text ?? ""));
    if (!parsed.success) return done({ ok: false, error: "invalid_output" });
    const trim = (xs: string[]) => xs.slice(0, 2).map((x) => x.slice(0, 200));
    return done({ ok: true, advice: { before: trim(parsed.data.before), during: trim(parsed.data.during), after: trim(parsed.data.after) } });
  } catch {
    return done({ ok: false, error: "invalid_output" });
  }
}
