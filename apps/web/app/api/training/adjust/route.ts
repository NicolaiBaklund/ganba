import { NextResponse } from "next/server";
import { z } from "zod";
import { planAdjustMessage, toProposalChanges, validateChanges } from "@loop/core";
import { apiUser } from "@/lib/api/user";
import { resolveAnthropicKey } from "@/lib/ai/keys";
import { adjustPlan } from "@/lib/ai/plan";
import { costUsd } from "@/lib/ai/pricing";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";
import { activePlan, goalOf, planContext, planWorkoutsWithKm, todayFor } from "@/lib/training/service";

export const maxDuration = 120;

const Body = z.object({ text: z.string().trim().min(3).max(1000) });
const STATUS = { invalid_key: 401, unavailable: 503, refused: 422, invalid_output: 422 } as const;
const HORIZON_DAYS = 28;

/** Free-text plan change → AI suggestion → engine guard rails → pending proposal (kind "ai"). */
export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const plan = await activePlan(u.user.id);
  if (!plan) return NextResponse.json({ error: "no_plan" }, { status: 409 });
  const apiKey = await resolveAnthropicKey(u.user.id);
  if (!apiKey) return NextResponse.json({ error: "no_key" }, { status: 402 });

  const today = await todayFor(u.user.id);
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + HORIZON_DAYS);
  const all = await planWorkoutsWithKm(plan);
  const upcoming = all.filter((w) => w.date >= today && w.date <= horizon.toISOString().slice(0, 10) && w.status !== "removed");
  const { text, refs } = planAdjustMessage({
    request: parsed.data.text,
    today,
    goal: goalOf(plan),
    weekdays: plan.weekdays,
    longRunWeekday: plan.long_run_weekday,
    workouts: upcoming,
  });

  const outcome = await adjustPlan(apiKey, text);
  const cost = costUsd(outcome.model, outcome.usage);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: STATUS[outcome.error] });

  const ctx = planContext(plan, today);
  const { valid, rejected } = validateChanges(all, toProposalChanges(outcome.result, refs), ctx, { allowAnyDay: outcome.result.namedDays });
  const summary = [outcome.result.summary, ...rejected.map((r) => `(Skipped one change: ${r.reason}.)`)].join(" ");

  const { data: row, error } = await createAdminSupabase()
    .from("plan_proposals")
    .insert({
      user_id: u.user.id,
      plan_id: plan.id,
      kind: "ai",
      summary,
      changes: valid as unknown as Json,
      status: valid.length ? "pending" : "rejected",
      request_text: parsed.data.text,
      model: outcome.model,
      input_tokens: outcome.usage.input,
      output_tokens: outcome.usage.output,
      cost_usd: cost,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  return NextResponse.json({ id: row.id, summary, changes: valid.length });
}
