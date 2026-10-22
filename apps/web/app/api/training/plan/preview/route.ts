import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { PlanInputSchema, raceDateOk } from "@/lib/validation/training";
import { previewPlan, previewRidePlan, todayFor } from "@/lib/training/service";

export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = PlanInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const today = await todayFor(u.user.id);
  if (parsed.data.sport === "ride") {
    const g = parsed.data.ride!.goal;
    if (g.kind === "event" && !raceDateOk(g.date, today)) return NextResponse.json({ error: "invalid_race_date" }, { status: 400 });
    const { fitness, plan, indoor } = await previewRidePlan(u.user.id, parsed.data);
    return NextResponse.json({
      sport: "ride",
      rideFitness: fitness,
      indoor,
      weeks: plan.weeks.map((w) => ({ ...w, minutes: Math.round(plan.workouts.filter((x) => x.week === w.week).reduce((s, x) => s + x.plannedDurationS, 0) / 60) })),
      predictedTimeS: plan.predictedTimeS,
      firstWeek: plan.workouts.slice(0, parsed.data.runsPerWeek).map((w) => ({ date: w.date, type: w.type, title: w.title, km: w.plannedKm, minutes: Math.round(w.plannedDurationS / 60) })),
    });
  }
  if (parsed.data.goal.kind === "race" && !raceDateOk(parsed.data.goal.raceDate, today))
    return NextResponse.json({ error: "invalid_race_date" }, { status: 400 });
  const { fitness, plan } = await previewPlan(u.user.id, parsed.data);
  return NextResponse.json({
    sport: "run",
    fitness,
    weeks: plan.weeks,
    peakKm: plan.peakKm,
    predictedTimeS: plan.predictedTimeS,
    racePaceS: plan.racePaceS,
    firstWeek: plan.workouts.slice(0, parsed.data.runsPerWeek).map((w) => ({ date: w.date, type: w.type, title: w.title, km: w.plannedKm })),
  });
}
