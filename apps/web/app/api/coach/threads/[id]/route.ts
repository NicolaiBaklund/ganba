import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { allMessages } from "@/lib/coach/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/coach/threads/[id]">) {
  const { id } = await ctx.params;
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ messages: await allMessages(u.user.id, id) });
}
