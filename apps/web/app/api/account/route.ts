import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Deletes every stored file, then the auth user (rows cascade). */
export async function DELETE() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminSupabase();
  for (const bucket of ["food", "body"] as const) {
    for (;;) {
      const { data: files, error } = await admin.storage.from(bucket).list(user.id, { limit: 1000 });
      if (error) return NextResponse.json({ error: "storage_error" }, { status: 500 });
      if (!files?.length) break;
      const { error: rmError } = await admin.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
      if (rmError) return NextResponse.json({ error: "storage_error" }, { status: 500 });
    }
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
