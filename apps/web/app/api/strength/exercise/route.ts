import { NextResponse } from "next/server";
import { z } from "zod";
import { MUSCLE_GROUPS } from "@loop/core";
import { apiUser } from "@/lib/api/user";
import { createExercise } from "@/lib/strength/sessions";

const Body = z.object({
  name: z.string().trim().min(1).max(60),
  group: z.enum(MUSCLE_GROUPS as [string, ...string[]]),
  measure: z.enum(["kg", "bw", "time"]),
});

/** "New exercise": the user's own, added to their list. */
export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const key = await createExercise(u.user.id, parsed.data as Parameters<typeof createExercise>[1]);
  return NextResponse.json({ key });
}
