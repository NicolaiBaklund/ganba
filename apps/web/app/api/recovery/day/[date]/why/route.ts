import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { dayAnswer } from "@/lib/recovery/insights";
import { STATUS } from "@/lib/recovery/status";
import { isRealDate } from "@/lib/recovery/dates";

export const maxDuration = 60;
const Body = z.object({ refresh: z.boolean().optional() });

export async function POST(req: Request, ctx: RouteContext<"/api/recovery/day/[date]/why">) {
  const { date } = await ctx.params;
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isRealDate(date)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const body = Body.safeParse((await req.json().catch(() => ({}))) ?? {});
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { refresh } = body.data;
  const r = await dayAnswer(u.user.id, date, { refresh });
  return r.ok ? NextResponse.json({ answer: r.answer, stale: r.stale }) : NextResponse.json({ error: r.error }, { status: STATUS[r.error] });
}
