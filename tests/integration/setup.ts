import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

export const admin = () =>
  createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

export interface TestUser {
  id: string;
  client: SupabaseClient<Database>;
}

const created: string[] = [];

/** Confirmed throwaway user + a client signed in as that user (RLS applies). */
export async function createTestUser(label: string): Promise<TestUser> {
  const email = `it-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@loop.test`;
  const password = `It-${crypto.randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

export async function cleanup() {
  const a = admin();
  for (const id of created.splice(0)) {
    for (const bucket of ["food", "body"]) {
      const { data } = await a.storage.from(bucket).list(id);
      if (data?.length) await a.storage.from(bucket).remove(data.map((f) => `${id}/${f.name}`));
    }
    await a.auth.admin.deleteUser(id);
  }
}
