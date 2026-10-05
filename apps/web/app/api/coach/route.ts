import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { resolveAnthropicKey } from "@/lib/ai/keys";
import { activePlan, todayFor } from "@/lib/training/service";
import { activeThread, allMessages, archivedThreads, listNotes } from "@/lib/coach/store";

export async function GET() {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [thread, key, plan, today] = await Promise.all([activeThread(u.user.id), resolveAnthropicKey(u.user.id), activePlan(u.user.id), todayFor(u.user.id)]);
  const [messages, notes, archived] = await Promise.all([allMessages(u.user.id, thread.id), listNotes(u.user.id, today), archivedThreads(u.user.id)]);
  return NextResponse.json({ messages, notes, archived, hasKey: !!key, hasPlan: !!plan });
}
