import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { dailyNote } from "@/lib/health/note";
import { todayFor } from "@/lib/training/service";

export const maxDuration = 60;

export async function GET() {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await dailyNote(u.user.id, await todayFor(u.user.id)));
}
