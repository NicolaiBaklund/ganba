import { after, NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { pushToGarmin, setRideIndoor, todayFor } from "@/lib/training/service";

export const maxDuration = 120;
const Body = z.object({ indoor: z.boolean() });

/** Indoor season on/off for the plan's rides: upcoming rides are rebuilt and pushed again. */
export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!(await setRideIndoor(u.user.id, body.data.indoor))) return NextResponse.json({ error: "no_ride_plan" }, { status: 409 });
  const today = await todayFor(u.user.id);
  after(() => pushToGarmin(u.user.id, today));
  return NextResponse.json({ ok: true });
}
