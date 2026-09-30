import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { FOOD_SYSTEM_PROMPT, FoodEstimateSchema, validateEstimate, type FoodEstimate } from "@loop/core";
import type { TokenUsage } from "./pricing";

export const FOOD_MODEL = process.env.AI_FOOD_MODEL ?? "claude-opus-5-5";
const EFFORT = (process.env.AI_FOOD_EFFORT ?? "medium") as "low" | "medium" | "high" | "xhigh" | "max";

export type EstimateError = "invalid_key" | "unavailable" | "refused" | "invalid_output";

export type EstimateOutcome =
  | { ok: true; estimate: FoodEstimate; usage: TokenUsage; model: string; latencyMs: number }
  | { ok: false; error: EstimateError; usage: TokenUsage; model: string; latencyMs: number };

export interface EstimateArgs {
  apiKey: string;
  /** Original description (first call) or correction text (follow-up). */
  text?: string;
  images: { data: string; mediaType: "image/webp" | "image/jpeg" | "image/png" }[];
  /** Present when correcting an earlier estimate. */
  previous?: { input: string; estimate: FoodEstimate };
}

/** Parse the JSON text block ourselves so a refusal or bad output never throws before we can classify it. */
function readEstimate(res: Anthropic.Message): FoodEstimate | null {
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return null;
  try {
    const parsed = FoodEstimateSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function estimateFood(args: EstimateArgs): Promise<EstimateOutcome> {
  const client = new Anthropic({ apiKey: args.apiKey, maxRetries: 2 });
  const started = Date.now();
  const usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const done = (r: { ok: true; estimate: FoodEstimate } | { ok: false; error: EstimateError }): EstimateOutcome => ({
    ...r,
    usage,
    model: FOOD_MODEL,
    latencyMs: Date.now() - started,
  });

  const firstText = args.previous ? args.previous.input : args.text;
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        ...args.images.map((i) => ({
          type: "image" as const,
          source: { type: "base64" as const, media_type: i.mediaType, data: i.data },
        })),
        { type: "text" as const, text: firstText?.trim() || "(photo only)" },
      ],
    },
  ];
  if (args.previous) {
    messages.push({ role: "assistant", content: JSON.stringify(args.previous.estimate) });
    messages.push({ role: "user", content: `Correction: ${args.text ?? ""}` });
  }

  // One extra attempt if the output is malformed or fails our sanity checks.
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Anthropic.Message;
    try {
      res = await client.messages.create({
        model: FOOD_MODEL,
        max_tokens: 16000,
        system: [{ type: "text", text: FOOD_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages,
        output_config: { effort: EFFORT, format: zodOutputFormat(FoodEstimateSchema) },
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
        return done({ ok: false, error: "invalid_key" });
      return done({ ok: false, error: "unavailable" });
    }
    usage.input += res.usage.input_tokens;
    usage.output += res.usage.output_tokens;
    usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;

    if (res.stop_reason === "refusal") return done({ ok: false, error: "refused" });
    const estimate = res.stop_reason === "max_tokens" ? null : readEstimate(res);
    if (estimate && validateEstimate(estimate).ok) return done({ ok: true, estimate });
  }
  return done({ ok: false, error: "invalid_output" });
}
