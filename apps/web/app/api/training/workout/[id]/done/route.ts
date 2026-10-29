import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { logManualRun, undoManualRun } from "@/lib/training/service";

const Body = z.object({ km: z.number().min(0.1).max(400), timeS: z.number().int().min(60).max(86_400).nullable().optional() });

/** "Done" without Garmin: logs the session's run by hand. With Garmin the watch says what was done. */
export async function POST(req: Request, ctx: RouteContext<"/api/training/workout/[id]/done">) {
  const { id } = await ctx.params;
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await getGarminStatus(u.user.id)) return NextResponse.json({ error: "garmin" }, { status: 409 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const r = await logManualRun(u.user.id, id, { km: parsed.data.km, timeS: parsed.data.timeS ?? null });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "not_found" ? 404 : 409 });
  return NextResponse.json({ ok: true });
}

/** "Undo": only a run logged by hand can be taken back. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/training/workout/[id]/done">) {
  const { id } = await ctx.params;
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await undoManualRun(u.user.id, id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "not_found" ? 404 : 409 });
  return NextResponse.json({ ok: true });
}
