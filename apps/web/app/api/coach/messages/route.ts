import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { coachResponse } from "@/lib/coach/stream";
import { isRealDate } from "@/lib/recovery/dates";

export const maxDuration = 300;
const Body = z.object({
  text: z.string().trim().min(1).max(2000),
  aboutWorkoutId: z.string().uuid().nullish(),
  aboutDate: z.string().refine(isRealDate, "not a date").nullish(),
});

/** One message to the coach: the answer streams back as NDJSON (status, text so far, done). */
export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  return coachResponse(u.user.id, body.data);
}
