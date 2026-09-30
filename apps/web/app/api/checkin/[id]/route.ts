import { NextResponse } from "next/server";
import { z } from "zod";
import { localDate } from "@loop/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { currentRow } from "@/lib/db/current";

const Body = z.object({ action: z.enum(["accept", "keep"]) });

export async function POST(req: Request, ctx: RouteContext<"/api/checkin/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { data: checkin } = await supabase
    .from("weekly_checkins")
    .select("id, status, proposed_base_kcal")
    .eq("id", id)
    .maybeSingle();
  if (!checkin || checkin.status !== "pending") return NextResponse.json({ error: "not_pending" }, { status: 409 });

  if (parsed.data.action === "keep") {
    await supabase.from("weekly_checkins").update({ status: "kept" }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", user.id).single();
  const today = localDate(profile?.timezone ?? "UTC");
  const plan = await currentRow(supabase, "energy_plans", user.id, today);
  if (!plan || checkin.proposed_base_kcal == null) return NextResponse.json({ error: "not_pending" }, { status: 409 });

  const { error } = await supabase.from("energy_plans").insert({
    user_id: user.id,
    base_expenditure_kcal: checkin.proposed_base_kcal,
    source: "adaptive",
    protein_g_per_kg: plan.protein_g_per_kg,
    fat_pct: plan.fat_pct,
    manual_kcal_override: null,
    checkin_id: id,
    valid_from: today,
  });
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  await supabase.from("weekly_checkins").update({ status: "accepted" }).eq("id", id);
  return NextResponse.json({ ok: true });
}
