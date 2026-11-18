import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { loadSpot } from "@/lib/health/spot";
import { todayFor } from "@/lib/training/service";

export const maxDuration = 60;

/** The place under the race clock on Training (spec 2026-11-18 §4). */
export async function GET() {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await loadSpot(u.user.id, await todayFor(u.user.id)));
}
