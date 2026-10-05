import { after, NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { applyOption } from "@/lib/coach/apply";
import { pushToGarmin, todayFor } from "@/lib/training/service";

export const maxDuration = 120;
const Body = z.object({ confirm: z.boolean().optional() });

export async function POST(req: Request, ctx: RouteContext<"/api/coach/options/[messageId]/[optionId]">) {
  const { messageId, optionId } = await ctx.params;
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = Body.safeParse((await req.json().catch(() => ({}))) ?? {});
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const r = await applyOption(u.user.id, messageId, optionId, body.data);
  if (!r.ok)
    return NextResponse.json(
      { error: r.error, warnings: "warnings" in r ? r.warnings : [], reason: "reason" in r ? r.reason : undefined },
      { status: r.error === "not_found" ? 404 : 409 },
    );
  const today = await todayFor(u.user.id);
  after(() => pushToGarmin(u.user.id, today));
  return NextResponse.json({ ok: true });
}
