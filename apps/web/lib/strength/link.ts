import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

const db = () => createAdminSupabase();
const STRENGTH_TYPE = "strength_training";
const LINK_DAYS = 35;

/**
 * Links sessions to a Garmin strength activity on the same day that no session has yet; with two, the one that
 * started nearest the session's first saved exercise (spec §7). Runs after saving and after every Garmin sync.
 */
export async function linkStrength(userId: string): Promise<void> {
  // Garmin syncs reach back a few weeks: older sessions never get a new activity.
  const since = new Date(Date.now() - LINK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data: open } = await db().from("strength_sessions").select("id, local_date, created_at").eq("user_id", userId).is("activity_id", null).gte("local_date", since);
  if (!open?.length) return;
  const dates = [...new Set(open.map((s) => s.local_date))];
  const [{ data: acts }, { data: linked }, { data: firstSets }] = await Promise.all([
    db().from("activities").select("id, local_date, start_time").eq("user_id", userId).eq("type_key", STRENGTH_TYPE).in("local_date", dates),
    db().from("strength_sessions").select("activity_id").eq("user_id", userId).not("activity_id", "is", null).gte("local_date", since),
    db().from("strength_sets").select("session_id, created_at").in("session_id", open.map((s) => s.id)).order("created_at"),
  ]);
  const taken = new Set((linked ?? []).map((l) => l.activity_id));
  const firstAt = new Map<string, number>();
  for (const s of firstSets ?? []) if (!firstAt.has(s.session_id)) firstAt.set(s.session_id, Date.parse(s.created_at));
  for (const s of open) {
    const at = firstAt.get(s.id) ?? Date.parse(s.created_at);
    const pick = (acts ?? [])
      .filter((a) => a.local_date === s.local_date && !taken.has(a.id))
      .sort((a, b) => Math.abs(Date.parse(a.start_time) - at) - Math.abs(Date.parse(b.start_time) - at))[0];
    if (!pick) continue;
    taken.add(pick.id);
    await db().from("strength_sessions").update({ activity_id: pick.id }).eq("id", s.id).is("activity_id", null);
  }
}
