import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { runCoach } from "@/lib/coach/run";

export const maxDuration = 300;
const Body = z.object({ text: z.string().trim().min(1).max(2000), aboutWorkoutId: z.string().uuid().nullish() });
const STATUS = { no_plan: 409, no_key: 402, busy: 409, invalid_key: 401, unavailable: 503, refused: 422, invalid_output: 422 } as const;

export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const r = await runCoach(u.user.id, body.data);
  return r.ok ? NextResponse.json({ message: r.message }) : NextResponse.json({ error: r.error }, { status: STATUS[r.error] });
}
