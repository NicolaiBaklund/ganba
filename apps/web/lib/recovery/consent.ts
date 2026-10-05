import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Has the user agreed to send their health data (sleep, HRV, food, training) to AI? Off by default. */
export async function getAiHealthConsent(userId: string): Promise<boolean> {
  const { data } = await createAdminSupabase().from("profiles").select("ai_health_consent").eq("user_id", userId).maybeSingle();
  return !!data?.ai_health_consent;
}

export async function setAiHealthConsent(userId: string, on: boolean): Promise<void> {
  const { error } = await createAdminSupabase()
    .from("profiles")
    .update({ ai_health_consent: on, ai_health_consent_at: on ? new Date().toISOString() : null })
    .eq("user_id", userId);
  if (error) throw error;
}
