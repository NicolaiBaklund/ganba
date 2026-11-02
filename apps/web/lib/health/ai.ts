import "server-only";
import { localDate, type ISODate } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { resolveAnthropicKey } from "@/lib/ai/keys";
import { languageOf } from "@/lib/ai/language";
import { getAiHealthConsent } from "@/lib/recovery/consent";

/** Before any AI call on health data: consent first (no call without it), then the key. */
export async function gate(userId: string): Promise<{ ok: true; apiKey: string; language: string; today: ISODate } | { ok: false; error: "consent_required" | "no_key" }> {
  if (!(await getAiHealthConsent(userId))) return { ok: false, error: "consent_required" };
  const apiKey = await resolveAnthropicKey(userId);
  if (!apiKey) return { ok: false, error: "no_key" };
  const { data: p } = await createAdminSupabase().from("profiles").select("locale, timezone").eq("user_id", userId).single();
  return { ok: true, apiKey, language: languageOf(p?.locale), today: localDate(p?.timezone ?? "UTC") };
}
