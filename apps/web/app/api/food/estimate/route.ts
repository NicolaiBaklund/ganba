import { NextResponse } from "next/server";
import { z } from "zod";
import { estimateTotals, FOOD_PROMPT_VERSION, FoodEstimateSchema, type FoodEstimate } from "@loop/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveAnthropicKey } from "@/lib/ai/keys";
import { estimateFood, FOOD_MODEL } from "@/lib/ai/food";
import { costUsd } from "@/lib/ai/pricing";

export const maxDuration = 120;

const Body = z
  .object({
    text: z.string().trim().max(1000).optional(),
    photoPaths: z.array(z.string()).max(4).default([]),
    parentEstimateId: z.string().uuid().optional(),
  })
  .refine((b) => (b.parentEstimateId ? !!b.text : !!b.text || b.photoPaths.length > 0));

const STATUS = { invalid_key: 401, unavailable: 503, refused: 422, invalid_output: 422 } as const;

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const b = parsed.data;

  const apiKey = await resolveAnthropicKey(user.id);
  if (!apiKey) return NextResponse.json({ error: "no_key" }, { status: 402 });

  // Follow-up correction reuses the parent's photos and original text.
  let photoPaths = b.photoPaths;
  let previous: { input: string; estimate: FoodEstimate } | undefined;
  if (b.parentEstimateId) {
    const { data: parent } = await supabase
      .from("ai_estimates")
      .select("input_text, photo_paths, response")
      .eq("id", b.parentEstimateId)
      .maybeSingle();
    const prevEstimate = FoodEstimateSchema.safeParse(parent?.response);
    if (!parent || !prevEstimate.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    photoPaths = parent.photo_paths;
    previous = { input: parent.input_text ?? "", estimate: prevEstimate.data };
  }

  // Only the caller's own food photos. Body photos never go to AI.
  if (photoPaths.some((p) => !p.startsWith(`${user.id}/`)))
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const images = [];
  for (const path of photoPaths) {
    const { data, error } = await supabase.storage.from("food").download(path);
    if (error || !data) return NextResponse.json({ error: "photo_missing" }, { status: 400 });
    images.push({ data: Buffer.from(await data.arrayBuffer()).toString("base64"), mediaType: "image/webp" as const });
  }

  const outcome = await estimateFood({ apiKey, text: b.text, images, previous });

  const { data: row } = await supabase
    .from("ai_estimates")
    .insert({
      user_id: user.id,
      parent_estimate_id: b.parentEstimateId ?? null,
      // Keep the whole conversation in input_text so a further correction still has all context.
      input_text: previous ? `${previous.input}\nCorrection: ${b.text}`.trim() : (b.text ?? null),
      photo_paths: photoPaths,
      model: outcome.model ?? FOOD_MODEL,
      prompt_version: FOOD_PROMPT_VERSION,
      response: outcome.ok ? outcome.estimate : null,
      input_tokens: outcome.usage.input + outcome.usage.cacheRead + outcome.usage.cacheWrite,
      output_tokens: outcome.usage.output,
      cost_usd: costUsd(outcome.model, outcome.usage),
      latency_ms: outcome.latencyMs,
      error: outcome.ok ? null : outcome.error,
    })
    .select("id")
    .single();

  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: STATUS[outcome.error] });
  return NextResponse.json({
    estimateId: row?.id ?? null,
    estimate: outcome.estimate,
    totals: estimateTotals(outcome.estimate.items),
  });
}
