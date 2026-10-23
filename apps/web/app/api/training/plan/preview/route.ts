import { NextResponse } from "next/server";
import { weekMinutes, type WorkoutSpec } from "@loop/core";
import { apiUser } from "@/lib/api/user";
import { PlanInputSchema, raceDateOk } from "@/lib/validation/training";
import { previewPlan, previewRidePlan, todayFor } from "@/lib/training/service";

/** Cross sessions of the first week that has any (what the wizard shows). */
const crossWeek = (cross: WorkoutSpec[]) => {
  const first = cross[0]?.week;
  return cross
    .filter((w) => w.week === first)
    .map((w) => ({ date: w.date, sport: w.sport, title: w.title, km: w.plannedKm, minutes: Math.round(w.plannedDurationS / 60) }));
};

export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = PlanInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const today = await todayFor(u.user.id);
  if (parsed.data.sport === "ride") {
    const g = parsed.data.ride!.goal;
    if (g.kind === "event" && !raceDateOk(g.date, today)) return NextResponse.json({ error: "invalid_race_date" }, { status: 400 });
    const { fitness, plan, indoor, power, cross } = await previewRidePlan(u.user.id, parsed.data);
    return NextResponse.json({
      sport: "ride",
      rideFitness: fitness,
      indoor,
      power,
      cross: crossWeek(cross),
      peakHours: Math.round((plan.peakKm / fitness.speedKmh) * 10) / 10,
      weeks: plan.weeks.map((w) => ({ ...w, minutes: weekMinutes(plan, w.week) })),
      predictedTimeS: plan.predictedTimeS,
      firstWeek: plan.workouts.slice(0, parsed.data.runsPerWeek).map((w) => ({ date: w.date, type: w.type, title: w.title, km: w.plannedKm, minutes: Math.round(w.plannedDurationS / 60) })),
    });
  }
  if (parsed.data.goal.kind === "race" && !raceDateOk(parsed.data.goal.raceDate, today))
    return NextResponse.json({ error: "invalid_race_date" }, { status: 400 });
  const { fitness, plan, ride, power, cross } = await previewPlan(u.user.id, parsed.data);
  return NextResponse.json({
    sport: "run",
    fitness,
    // Rides on cross days: their zones, and whether power targets apply.
    rideFitness: ride,
    power,
    cross: crossWeek(cross),
    weeks: plan.weeks,
    peakKm: plan.peakKm,
    predictedTimeS: plan.predictedTimeS,
    racePaceS: plan.racePaceS,
    firstWeek: plan.workouts.slice(0, parsed.data.runsPerWeek).map((w) => ({ date: w.date, type: w.type, title: w.title, km: w.plannedKm })),
  });
}
