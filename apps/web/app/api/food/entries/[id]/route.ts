import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { UpdateEntry } from "@/lib/validation/food";

async function auth() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/food/entries/[id]">) {
  const { id } = await ctx.params;
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = UpdateEntry.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { data: entry } = await supabase.from("food_entries").select("id").eq("id", id).maybeSingle();
  if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (body.data.mealType) {
    await supabase.from("food_entries").update({ meal_type: body.data.mealType }).eq("id", id);
  }
  if (body.data.items) {
    await supabase.from("food_items").delete().eq("food_entry_id", id);
    const { error } = await supabase
      .from("food_items")
      .insert(body.data.items.map((it) => ({ ...it, user_id: user.id, food_entry_id: id })));
    if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/food/entries/[id]">) {
  const { id } = await ctx.params;
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: photos } = await supabase.from("photos").select("storage_path").eq("food_entry_id", id);
  if (photos?.length) {
    const { error } = await supabase.storage.from("food").remove(photos.map((p) => p.storage_path));
    if (error) return NextResponse.json({ error: "storage_error" }, { status: 500 });
  }
  const { error } = await supabase.from("food_entries").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
