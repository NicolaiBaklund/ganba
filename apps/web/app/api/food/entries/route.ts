import { NextResponse } from "next/server";
import { localDate } from "@loop/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { CreateEntry } from "@/lib/validation/food";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = CreateEntry.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const b = body.data;
  if (b.photoPaths.some((p) => !p.startsWith(`${user.id}/`)))
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", user.id).single();
  const loggedAt = b.loggedAt ? new Date(b.loggedAt) : new Date();
  const tz = profile?.timezone ?? "UTC";
  const day = b.localDate ?? localDate(tz, loggedAt);
  if (day > localDate(tz)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { data: entry, error } = await supabase
    .from("food_entries")
    .insert({ user_id: user.id, logged_at: loggedAt.toISOString(), local_date: day, meal_type: b.mealType, source: b.source })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });

  const { error: itemsErr } = await supabase
    .from("food_items")
    .insert(b.items.map((it) => ({ ...it, user_id: user.id, food_entry_id: entry.id })));
  if (itemsErr) {
    await supabase.from("food_entries").delete().eq("id", entry.id);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (b.photoPaths.length) {
    await supabase.from("photos").insert(
      b.photoPaths.map((p) => ({ user_id: user.id, bucket: "food" as const, storage_path: p, food_entry_id: entry.id })),
    );
  }
  if (b.estimateId) {
    await supabase.from("ai_estimates").update({ food_entry_id: entry.id }).eq("id", b.estimateId);
  }
  return NextResponse.json({ id: entry.id });
}
