import { after, NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { PlanInputSchema, raceDateOk } from "@/lib/validation/training";
import { cancelPlan, createPlan, pushToGarmin, todayFor } from "@/lib/training/service";

export const maxDuration = 120;

export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await getGarminStatus(u.user.id))) return NextResponse.json({ error: "garmin_required" }, { status: 409 });
  const parsed = PlanInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const today = await todayFor(u.user.id);
  if (parsed.data.goal.kind === "race" && !raceDateOk(parsed.data.goal.raceDate, today))
    return NextResponse.json({ error: "invalid_race_date" }, { status: 400 });
  const id = await createPlan(u.user.id, parsed.data);
  after(() => pushToGarmin(u.user.id, today));
  return NextResponse.json({ id });
}

export async function DELETE() {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await cancelPlan(u.user.id);
  const today = await todayFor(u.user.id);
  after(() => pushToGarmin(u.user.id, today));
  return NextResponse.json({ ok: true });
}
