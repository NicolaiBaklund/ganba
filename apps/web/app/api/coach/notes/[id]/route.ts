import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { editNote, removeNotes } from "@/lib/coach/store";

const Body = z.object({ text: z.string().trim().min(1).max(200) });

export async function PATCH(req: Request, ctx: RouteContext<"/api/coach/notes/[id]">) {
  const { id } = await ctx.params;
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  return (await editNote(u.user.id, id, body.data.text)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/coach/notes/[id]">) {
  const { id } = await ctx.params;
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await removeNotes(u.user.id, [id]);
  return NextResponse.json({ ok: true });
}
