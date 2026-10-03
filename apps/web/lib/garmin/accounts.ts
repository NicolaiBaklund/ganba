import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/ai/crypto";

/** Garmin tokens and MFA state live in server-only tables (RLS on, no policies). */

export interface GarminAccountStatus {
  status: "active" | "reauth_required";
  connectedAt: string;
  lastSyncedAt: string | null;
  historyImportedAt: string | null;
}

const MFA_TTL_MS = 5 * 60_000;

export async function getGarminStatus(userId: string): Promise<GarminAccountStatus | null> {
  const { data } = await createAdminSupabase()
    .from("garmin_accounts")
    .select("status, connected_at, last_synced_at, history_imported_at")
    .eq("user_id", userId)
    .maybeSingle();
  return data
    ? { status: data.status, connectedAt: data.connected_at, lastSyncedAt: data.last_synced_at, historyImportedAt: data.history_imported_at }
    : null;
}

export async function loadTokens(userId: string): Promise<string | null> {
  const { data } = await createAdminSupabase()
    .from("garmin_accounts")
    .select("ciphertext, iv, auth_tag, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.status !== "active") return null;
  try {
    return decryptSecret({ ciphertext: data.ciphertext, iv: data.iv, authTag: data.auth_tag });
  } catch {
    return null;
  }
}

/** Stores (or replaces) tokens and marks the account active. Returns true when this is a new connection. */
export async function saveTokens(userId: string, tokens: string): Promise<boolean> {
  const db = createAdminSupabase();
  const enc = encryptSecret(tokens);
  const { data: existing } = await db.from("garmin_accounts").select("user_id").eq("user_id", userId).maybeSingle();
  const row = { ciphertext: enc.ciphertext, iv: enc.iv, auth_tag: enc.authTag, status: "active" as const };
  if (existing) {
    await db.from("garmin_accounts").update(row).eq("user_id", userId);
    return false;
  }
  const { error } = await db.from("garmin_accounts").insert({ user_id: userId, ...row });
  if (error) throw error;
  return true;
}

/** Refreshed tokens from the adapter; only written while the account is still active. */
export async function updateTokens(userId: string, tokens: string): Promise<void> {
  const enc = encryptSecret(tokens);
  await createAdminSupabase()
    .from("garmin_accounts")
    .update({ ciphertext: enc.ciphertext, iv: enc.iv, auth_tag: enc.authTag })
    .eq("user_id", userId)
    .eq("status", "active");
}

export async function markReauth(userId: string): Promise<void> {
  await createAdminSupabase().from("garmin_accounts").update({ status: "reauth_required", sync_started_at: null }).eq("user_id", userId);
}

export async function deleteGarminAccount(userId: string): Promise<void> {
  const db = createAdminSupabase();
  await db.from("garmin_login_states").delete().eq("user_id", userId);
  await db.from("garmin_accounts").delete().eq("user_id", userId);
}

export async function saveMfaState(userId: string, state: unknown): Promise<string> {
  const db = createAdminSupabase();
  await db.from("garmin_login_states").delete().eq("user_id", userId);
  const enc = encryptSecret(JSON.stringify(state));
  const { data, error } = await db
    .from("garmin_login_states")
    .insert({
      user_id: userId,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      auth_tag: enc.authTag,
      expires_at: new Date(Date.now() + MFA_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** One-shot: reading the MFA state deletes it. */
export async function takeMfaState(userId: string, id: string): Promise<unknown | null> {
  const db = createAdminSupabase();
  const { data } = await db
    .from("garmin_login_states")
    .select("ciphertext, iv, auth_tag, expires_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  await db.from("garmin_login_states").delete().eq("user_id", userId).eq("id", id);
  if (!data || Date.parse(data.expires_at) < Date.now()) return null;
  try {
    return JSON.parse(decryptSecret({ ciphertext: data.ciphertext, iv: data.iv, authTag: data.auth_tag }));
  } catch {
    return null;
  }
}
