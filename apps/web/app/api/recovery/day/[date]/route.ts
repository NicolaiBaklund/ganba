import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { loadRecoveryDay } from "@/lib/recovery/day";
import { isRealDate } from "@/lib/recovery/dates";

export async function GET(_req: Request, ctx: RouteContext<"/api/recovery/day/[date]">) {
  const { date } = await ctx.params;
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isRealDate(date)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  return NextResponse.json(await loadRecoveryDay(u.user.id, date));
}
