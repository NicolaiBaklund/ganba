import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { keepPlan, swapToEasy } from "@/lib/health/note";
import { todayFor } from "@/lib/training/service";

const Body = z.object({ keep: z.boolean().default(false) });

/** The alert's two buttons: swap the hard session for an easy run, or keep the plan. */
export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const today = await todayFor(u.user.id);
  if (parsed.data.keep) {
    await keepPlan(u.user.id, today);
    return NextResponse.json({ ok: true });
  }
  return (await swapToEasy(u.user.id, today)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_swappable" }, { status: 409 });
}
