import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/weight/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: photos } = await supabase.from("photos").select("storage_path").eq("weight_entry_id", id);
  if (photos?.length) {
    const { error } = await supabase.storage.from("body").remove(photos.map((p) => p.storage_path));
    if (error) return NextResponse.json({ error: "storage_error" }, { status: 500 });
  }
  const { error } = await supabase.from("weight_entries").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
