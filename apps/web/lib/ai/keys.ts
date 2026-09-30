import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { decryptSecret } from "./crypto";

/**
 * The only place that decides which Anthropic key a request uses.
 * Today: the user's own key. Later (product): fall back to a platform key here.
 */
export async function resolveAnthropicKey(userId: string): Promise<string | null> {
  const { data } = await createAdminSupabase()
    .from("api_keys")
    .select("ciphertext, iv, auth_tag")
    .eq("user_id", userId)
    .eq("provider", "anthropic")
    .maybeSingle();
  if (!data) return null;
  try {
    return decryptSecret({ ciphertext: data.ciphertext, iv: data.iv, authTag: data.auth_tag });
  } catch {
    return null; // encryption secret changed; user must re-enter the key
  }
}

export async function getApiKeyStatus(userId: string): Promise<{ last4: string; validatedAt: string | null } | null> {
  const { data } = await createAdminSupabase()
    .from("api_keys")
    .select("last4, validated_at")
    .eq("user_id", userId)
    .eq("provider", "anthropic")
    .maybeSingle();
  return data ? { last4: data.last4, validatedAt: data.validated_at } : null;
}
