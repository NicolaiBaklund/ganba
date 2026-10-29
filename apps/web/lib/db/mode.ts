import "server-only";
import { cache } from "react";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** "full": food, body and training. "training": Training only, no food or body data (spec 2026-10-29). */
export type Mode = "full" | "training";

export const modeOf = cache(async (userId: string): Promise<Mode> => {
  const { data } = await createAdminSupabase().from("profiles").select("mode").eq("user_id", userId).maybeSingle();
  return data?.mode === "training" ? "training" : "full";
});
