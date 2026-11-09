import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { setStrengthDays } from "@/lib/training/service";

const Body = z.object({ days: z.array(z.number().int().min(0).max(6)).max(7) });

/** Strength days in the plan: stored on the plan, nothing rebuilt and nothing sent to the watch. */
export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!(await setStrengthDays(u.user.id, body.data.days))) return NextResponse.json({ error: "no_plan" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
