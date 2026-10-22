import { after, NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { pushToGarmin, setRidePower, todayFor } from "@/lib/training/service";

export const maxDuration = 120;
const Body = z.object({ power: z.boolean() });

/** Power targets on/off for the plan's rides: targets switch (watts ↔ heart rate) and are pushed again. */
export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!(await setRidePower(u.user.id, body.data.power))) return NextResponse.json({ error: "no_power" }, { status: 409 });
  const today = await todayFor(u.user.id);
  after(() => pushToGarmin(u.user.id, today));
  return NextResponse.json({ ok: true });
}
