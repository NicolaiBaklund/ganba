import { NextResponse } from "next/server";
import { fuelingFor, fuelMessage, type FuelAdvice } from "@loop/core";
import { apiUser } from "@/lib/api/user";
import { resolveAnthropicKey } from "@/lib/ai/keys";
import { suggestFuel } from "@/lib/ai/fuel";
import { costUsd } from "@/lib/ai/pricing";
import { getDaySnapshot } from "@/lib/db/today";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";
import { todayFor } from "@/lib/training/service";

export const maxDuration = 60;

const STATUS = { invalid_key: 401, unavailable: 503, refused: 422, invalid_output: 422 } as const;
const LANGUAGE: Record<string, string> = { nb: "Norwegian (bokmål)", nn: "Norwegian (nynorsk)", en: "English" };

/** AI food ideas for one upcoming session, saved on the session so it is asked only once. */
export async function POST(_req: Request, ctx: RouteContext<"/api/training/workout/[id]/fuel">) {
  const { id } = await ctx.params;
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createAdminSupabase();
  const { data: w } = await db
    .from("planned_workouts")
    .select("id, date, title, type, planned_duration_s, status, fuel_advice")
    .eq("id", id)
    .eq("user_id", u.user.id)
    .maybeSingle();
  if (!w) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const existing = w.fuel_advice as { advice?: FuelAdvice } | null;
  if (existing?.advice) return NextResponse.json({ advice: existing.advice });

  const today = await todayFor(u.user.id);
  if (w.status !== "planned" || w.date < today) return NextResponse.json({ error: "not_upcoming" }, { status: 409 });
  const apiKey = await resolveAnthropicKey(u.user.id);
  if (!apiKey) return NextResponse.json({ error: "no_key" }, { status: 402 });

  const snap = await getDaySnapshot(u.supabase, u.user.id, w.date);
  const { data: profile } = await u.supabase.from("profiles").select("locale").eq("user_id", u.user.id).single();
  const kg = snap.latestTrendKg ?? 70;
  const message = fuelMessage({
    workoutTitle: w.title,
    minutes: w.planned_duration_s / 60,
    fueling: fuelingFor({ type: w.type, plannedDurationS: w.planned_duration_s }, kg),
    eatenToday: snap.date === today ? snap.entries.flatMap((e) => e.items.map((i) => `${i.name} (${Math.round(Number(i.kcal))} kcal)`)) : [],
    remaining: {
      kcal: Math.max(0, Math.round(snap.macrosTarget.kcal - snap.intake.kcal)),
      proteinG: Math.max(0, Math.round(snap.macrosTarget.proteinG - snap.intake.proteinG)),
      carbsG: Math.max(0, Math.round(snap.macrosTarget.carbsG - snap.intake.carbsG)),
      fatG: Math.max(0, Math.round(snap.macrosTarget.fatG - snap.intake.fatG)),
    },
    language: LANGUAGE[profile?.locale ?? "en"] ?? "English",
  });

  const out = await suggestFuel(apiKey, message);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: STATUS[out.error] });
  await db
    .from("planned_workouts")
    .update({
      fuel_advice: { advice: out.advice, model: out.model, costUsd: costUsd(out.model, out.usage), createdAt: new Date().toISOString() } as unknown as Json,
    })
    .eq("id", w.id);
  return NextResponse.json({ advice: out.advice });
}
