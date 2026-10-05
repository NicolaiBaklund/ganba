import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { TokenUsage } from "./pricing";

export const RECOVERY_MODEL = process.env.AI_RECOVERY_MODEL ?? "claude-sonnet-5";
const EFFORT = (process.env.AI_RECOVERY_EFFORT ?? "low") as "low" | "medium" | "high";

export type AiError = "invalid_key" | "unavailable" | "refused" | "invalid_output";
export type AiResult<T> = { ok: true; value: T; usage: TokenUsage; model: string } | { ok: false; error: AiError; usage: TokenUsage; model: string };

/** One structured question to the model. Tests pass a fake. */
export interface RecoveryAi {
  ask<T>(apiKey: string, system: string, message: string, schema: z.ZodType<T>): Promise<AiResult<T>>;
}

export const anthropicRecoveryAi: RecoveryAi = {
  async ask<T>(apiKey: string, system: string, message: string, schema: z.ZodType<T>): Promise<AiResult<T>> {
    const client = new Anthropic({ apiKey, maxRetries: 2 });
    const usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const fail = (error: AiError): AiResult<T> => ({ ok: false, error, usage, model: RECOVERY_MODEL });
    let res: Anthropic.Message;
    try {
      res = await client.messages.create({
        model: RECOVERY_MODEL,
        max_tokens: 4000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: message }],
        output_config: { effort: EFFORT, format: zodOutputFormat(schema as z.ZodType<T> & z.ZodObject) },
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return fail("invalid_key");
      return fail("unavailable");
    }
    usage.input += res.usage.input_tokens;
    usage.output += res.usage.output_tokens;
    usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;
    if (res.stop_reason === "refusal") return fail("refused");
    if (res.stop_reason === "max_tokens") return fail("invalid_output");
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    try {
      const parsed = schema.safeParse(JSON.parse(text ?? ""));
      return parsed.success ? { ok: true, value: parsed.data, usage, model: RECOVERY_MODEL } : fail("invalid_output");
    } catch {
      return fail("invalid_output");
    }
  },
};
