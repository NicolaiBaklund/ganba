import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { weeklySummary } from "@/lib/recovery/insights";
import { STATUS } from "@/lib/recovery/status";

export const maxDuration = 60;

export async function POST() {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await weeklySummary(u.user.id);
  return r.ok ? NextResponse.json({ summary: r.summary, weekStart: r.weekStart }) : NextResponse.json({ error: r.error }, { status: STATUS[r.error] });
}
