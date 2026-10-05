import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { formNote } from "@/lib/recovery/form-note";
import { STATUS } from "@/lib/recovery/status";

export const maxDuration = 60;

export async function POST() {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await formNote(u.user.id);
  return r.ok ? NextResponse.json({ sentences: r.answer.sentences }) : NextResponse.json({ error: r.error }, { status: STATUS[r.error] });
}
