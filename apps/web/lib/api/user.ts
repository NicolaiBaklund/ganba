import "server-only";
import { currentUser } from "@/lib/supabase/server";

/** Signed-in user for API routes, or null (respond 401). */
export async function apiUser() {
  const { supabase, user } = await currentUser();
  return user ? { supabase, user } : null;
}
