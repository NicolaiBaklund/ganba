import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Database } from "@/lib/db/types";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component; proxy.ts refreshes the session.
          }
        },
      },
    },
  );
}

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * The signed-in user from the verified JWT (checked locally with the project's signing keys;
 * no Auth-server round trip). Cached per request, so layout and page share one lookup.
 */
export const currentUser = cache(async (): Promise<{ supabase: Awaited<ReturnType<typeof createServerSupabase>>; user: SessionUser | null }> => {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  return { supabase, user: c?.sub ? { id: c.sub, email: typeof c.email === "string" ? c.email : null } : null };
});

const onboarded = cache(async (userId: string): Promise<boolean> => {
  const { supabase } = await currentUser();
  const { data } = await supabase.from("profiles").select("onboarded_at").eq("user_id", userId).maybeSingle();
  return !!data?.onboarded_at;
});

export async function requireUser({ allowUnonboarded = false } = {}) {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login");
  if (!allowUnonboarded && !(await onboarded(user.id))) redirect("/onboarding");
  return { supabase, user };
}
