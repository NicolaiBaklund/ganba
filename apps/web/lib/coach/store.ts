import "server-only";
import type { PlanWarning, ProposalChange } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";

export const MAX_NOTES = 15;
export const BUSY_MS = 5 * 60_000;

export interface CoachOption {
  id: string;
  title: string;
  summary: string;
  changes: ProposalChange[];
  /** What the option does, one line per change ("Tue 10-06 easy 6.4 km → 8.4 km"). */
  lines: string[];
  warnings: PlanWarning[];
  status: "pending" | "applied" | "not_used" | "stale" | "invalid";
  /** Why an option can no longer be applied. */
  reason?: string;
}
export interface CoachMessage {
  id: string;
  role: "user" | "coach";
  text: string;
  aboutWorkoutId: string | null;
  options: CoachOption[];
  /** The reply was written with recovery data in its context. */
  usedHealth: boolean;
  createdAt: string;
}
export interface CoachNote {
  id: string;
  text: string;
  until: string | null;
  source: "coach" | "user";
}

const db = () => createAdminSupabase();
type Row = { id: string; role: string; text: string; about_workout_id: string | null; options: Json; used_health: boolean; created_at: string };
const toMessage = (r: Row): CoachMessage => ({
  id: r.id,
  role: r.role as CoachMessage["role"],
  text: r.text,
  aboutWorkoutId: r.about_workout_id,
  options: (r.options as unknown as CoachOption[]) ?? [],
  usedHealth: r.used_health,
  createdAt: r.created_at,
});
const COLS = "id, role, text, about_workout_id, options, used_health, created_at";

export async function activeThread(userId: string): Promise<{ id: string }> {
  const { data } = await db().from("coach_threads").select("id").eq("user_id", userId).is("archived_at", null).maybeSingle();
  if (data) return data;
  const { data: created, error } = await db().from("coach_threads").insert({ user_id: userId }).select("id").single();
  if (error) {
    // Another request created it first (unique active thread).
    const { data: again } = await db().from("coach_threads").select("id").eq("user_id", userId).is("archived_at", null).single();
    return again!;
  }
  return created;
}

/** Starts over; false while the coach is still answering in the active conversation. */
export async function archiveThread(userId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: active } = await db().from("coach_threads").select("id").eq("user_id", userId).is("archived_at", null).maybeSingle();
  if (!active) return true;
  const { data } = await db()
    .from("coach_threads")
    .update({ archived_at: now })
    .eq("id", active.id)
    .or(`busy_until.is.null,busy_until.lt.${now}`)
    .select("id");
  return !!data?.length;
}

export async function archivedThreads(userId: string): Promise<{ id: string; createdAt: string }[]> {
  const { data } = await db().from("coach_threads").select("id, created_at").eq("user_id", userId).not("archived_at", "is", null).order("created_at", { ascending: false }).limit(20);
  return (data ?? []).map((t) => ({ id: t.id, createdAt: t.created_at }));
}

export async function allMessages(userId: string, threadId: string): Promise<CoachMessage[]> {
  const { data } = await db().from("coach_messages").select(COLS).eq("user_id", userId).eq("thread_id", threadId).order("created_at");
  return (data ?? []).map(toMessage);
}

export async function recentMessages(threadId: string, n: number): Promise<CoachMessage[]> {
  const { data } = await db().from("coach_messages").select(COLS).eq("thread_id", threadId).order("created_at", { ascending: false }).limit(n);
  return (data ?? []).map(toMessage).reverse();
}

export async function addMessage(
  userId: string,
  threadId: string,
  m: { role: "user" | "coach"; text: string; aboutWorkoutId?: string | null; options?: CoachOption[]; usedHealth?: boolean; usage?: { model: string; input: number; output: number; costUsd: number | null; promptVersion: number } },
): Promise<CoachMessage> {
  const { data, error } = await db()
    .from("coach_messages")
    .insert({
      user_id: userId,
      thread_id: threadId,
      role: m.role,
      text: m.text,
      about_workout_id: m.aboutWorkoutId ?? null,
      options: (m.options ?? []) as unknown as Json,
      used_health: m.usedHealth ?? false,
      model: m.usage?.model ?? null,
      prompt_version: m.usage?.promptVersion ?? null,
      input_tokens: m.usage?.input ?? null,
      output_tokens: m.usage?.output ?? null,
      cost_usd: m.usage?.costUsd ?? null,
    })
    .select(COLS)
    .single();
  if (error) throw error;
  return toMessage(data);
}

export async function updateOptions(messageId: string, options: CoachOption[]): Promise<void> {
  await db().from("coach_messages").update({ options: options as unknown as Json }).eq("id", messageId);
}

/** One reply at a time per thread: a second message while one is being answered gets false. */
export async function claimThread(threadId: string): Promise<boolean> {
  const now = new Date();
  const { data } = await db()
    .from("coach_threads")
    .update({ busy_until: new Date(now.getTime() + BUSY_MS).toISOString() })
    .eq("id", threadId)
    .or(`busy_until.is.null,busy_until.lt.${now.toISOString()}`)
    .select("id");
  return !!data?.length;
}
export async function releaseThread(threadId: string): Promise<void> {
  await db().from("coach_threads").update({ busy_until: null }).eq("id", threadId);
}

/** One option applied at a time per message. */
export async function claimMessage(messageId: string): Promise<boolean> {
  const now = new Date();
  const { data } = await db()
    .from("coach_messages")
    .update({ applying_until: new Date(now.getTime() + 60_000).toISOString() })
    .eq("id", messageId)
    .or(`applying_until.is.null,applying_until.lt.${now.toISOString()}`)
    .select("id");
  return !!data?.length;
}
export async function releaseMessage(messageId: string): Promise<void> {
  await db().from("coach_messages").update({ applying_until: null }).eq("id", messageId);
}

/** Notes for the coach; expired ones are deleted first. */
export async function listNotes(userId: string, today: string): Promise<CoachNote[]> {
  await db().from("coach_notes").delete().eq("user_id", userId).lt("until", today);
  const { data } = await db().from("coach_notes").select("id, text, until, source").eq("user_id", userId).order("created_at");
  return (data ?? []).map((n) => ({ id: n.id, text: n.text, until: n.until, source: n.source as CoachNote["source"] }));
}

/** Adds notes; over the limit the oldest coach notes go first (the user's own stay). */
export async function addNotes(userId: string, notes: { text: string; until?: string | null }[], source: "coach" | "user"): Promise<void> {
  if (!notes.length) return;
  const rows = notes.map((n) => ({ user_id: userId, text: n.text.trim().slice(0, 200), until: n.until ?? null, source })).filter((n) => n.text);
  if (rows.length) {
    const { error } = await db().from("coach_notes").insert(rows);
    if (error) throw new Error(`notes not saved: ${error.message}`);
  }
  const { data } = await db().from("coach_notes").select("id, source, created_at").eq("user_id", userId).order("created_at");
  const all = data ?? [];
  const over = all.length - MAX_NOTES;
  if (over > 0) {
    const drop = [...all.filter((n) => n.source === "coach"), ...all.filter((n) => n.source === "user")].slice(0, over).map((n) => n.id);
    await db().from("coach_notes").delete().in("id", drop);
  }
}

export async function removeNotes(userId: string, ids: string[]): Promise<void> {
  if (ids.length) await db().from("coach_notes").delete().eq("user_id", userId).in("id", ids);
}

export async function editNote(userId: string, id: string, text: string): Promise<boolean> {
  const { data } = await db().from("coach_notes").update({ text: text.trim().slice(0, 200), source: "user" }).eq("user_id", userId).eq("id", id).select("id");
  return !!data?.length;
}
