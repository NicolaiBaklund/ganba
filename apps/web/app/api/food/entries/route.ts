import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { CreateEntry } from "@/lib/validation/food";
import { createFoodEntry, EntryError } from "@/lib/food/entries";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = CreateEntry.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  try {
    return NextResponse.json({ id: await createFoodEntry(supabase, user.id, body.data) });
  } catch (e) {
    if (e instanceof EntryError) return NextResponse.json({ error: e.code }, { status: e.status });
    throw e;
  }
}
