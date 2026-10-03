import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

/** Signed-in user for API routes, or null (respond 401). */
export async function apiUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}
