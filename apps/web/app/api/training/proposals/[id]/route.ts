import { after, NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { acceptProposal, pushToGarmin, rejectProposal, todayFor } from "@/lib/training/service";

export const maxDuration = 120;

const Body = z.object({ action: z.enum(["accept", "reject"]) });

export async function POST(req: Request, ctx: RouteContext<"/api/training/proposals/[id]">) {
  const { id } = await ctx.params;
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const ok = parsed.data.action === "accept" ? await acceptProposal(u.user.id, id) : await rejectProposal(u.user.id, id);
  if (!ok) return NextResponse.json({ error: "not_pending" }, { status: 409 });
  if (parsed.data.action === "accept") {
    const today = await todayFor(u.user.id);
    after(() => pushToGarmin(u.user.id, today));
  }
  return NextResponse.json({ ok: true });
}
