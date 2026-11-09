import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { deleteSession, finishSession, removeExercise, saveExercise, StrengthError } from "@/lib/strength/sessions";

const Set = z.object({
  reps: z.number().int().min(0).max(500).nullable(),
  kg: z.number().min(0).max(1000).nullable(),
  seconds: z.number().int().min(0).max(36000).nullable(),
});
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), sessionId: z.string().uuid(), key: z.string().min(1).max(80), position: z.number().int().min(0).max(100), sets: z.array(Set).min(1).max(20) }),
  z.object({ action: z.literal("remove"), sessionId: z.string().uuid(), key: z.string().min(1).max(80) }),
  z.object({ action: z.literal("finish"), sessionId: z.string().uuid() }),
  z.object({ action: z.literal("delete"), sessionId: z.string().uuid() }),
]);

/** Saving an exercise (✓), removing one, Finish and Delete session (spec §6). */
export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const b = parsed.data;
  try {
    if (b.action === "save") await saveExercise(u.user.id, b.sessionId, { key: b.key, position: b.position, sets: b.sets.map((s, i) => ({ setNo: i + 1, ...s })) });
    else if (b.action === "remove") await removeExercise(u.user.id, b.sessionId, b.key);
    else if (b.action === "delete") await deleteSession(u.user.id, b.sessionId);
    else return NextResponse.json({ result: await finishSession(u.user.id, b.sessionId) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof StrengthError) return NextResponse.json({ error: e.code }, { status: e.code === "not_found" ? 404 : 400 });
    throw e;
  }
}
