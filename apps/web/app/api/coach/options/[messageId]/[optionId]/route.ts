import { after, NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { applyOption, dismissOptions } from "@/lib/coach/apply";
import { pushToGarmin, todayFor } from "@/lib/training/service";

export const maxDuration = 120;

/** "Use this" on a coach option: applied if it still fits the plan, else invalid with the reason. */
export async function POST(_req: Request, ctx: RouteContext<"/api/coach/options/[messageId]/[optionId]">) {
  const { messageId, optionId } = await ctx.params;
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await applyOption(u.user.id, messageId, optionId);
  if (!r.ok) return NextResponse.json({ error: r.error, reason: "reason" in r ? r.reason : undefined }, { status: r.error === "not_found" ? 404 : 409 });
  const today = await todayFor(u.user.id);
  after(() => pushToGarmin(u.user.id, today));
  return NextResponse.json({ ok: true });
}

/** "Not now": turns down all open options in the reply this one belongs to. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/coach/options/[messageId]/[optionId]">) {
  const { messageId } = await ctx.params;
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await dismissOptions(u.user.id, messageId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "not_found" ? 404 : 409 });
  return NextResponse.json({ ok: true });
}
