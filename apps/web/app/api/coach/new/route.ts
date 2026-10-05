import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { archiveThread } from "@/lib/coach/store";

export async function POST() {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await archiveThread(u.user.id))) return NextResponse.json({ error: "busy" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
