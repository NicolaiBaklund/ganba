import { after, NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { pushToGarmin, setCrossDays, todayFor } from "@/lib/training/service";

export const maxDuration = 120;
const Body = z.object({ days: z.array(z.number().int().min(0).max(6)).max(5) });

/** Days for easy sessions of the other sport: upcoming cross sessions are rebuilt and pushed again. */
export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!(await setCrossDays(u.user.id, body.data.days))) return NextResponse.json({ error: "no_plan" }, { status: 409 });
  const today = await todayFor(u.user.id);
  after(() => pushToGarmin(u.user.id, today));
  return NextResponse.json({ ok: true });
}
