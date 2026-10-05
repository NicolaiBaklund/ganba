import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { proposeQuestions } from "@/lib/recovery/insights";
import { STATUS } from "@/lib/recovery/status";

export const maxDuration = 60;

export async function POST() {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await proposeQuestions(u.user.id);
  return r.ok ? NextResponse.json({ created: r.created }) : NextResponse.json({ error: r.error }, { status: STATUS[r.error] });
}
