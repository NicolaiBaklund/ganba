import { NextResponse } from "next/server";
import { z } from "zod";
import { localDate } from "@loop/core";
import { createServerSupabase } from "@/lib/supabase/server";

const Body = z.object({
  weightKg: z.number().min(20).max(400),
  measuredAt: z.string().datetime({ offset: true }).optional(),
  photoPaths: z.array(z.string()).max(3).default([]),
});

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const b = parsed.data;
  if (b.photoPaths.some((p) => !p.startsWith(`${user.id}/`)))
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", user.id).single();
  const at = b.measuredAt ? new Date(b.measuredAt) : new Date();

  const { data, error } = await supabase
    .from("weight_entries")
    .insert({
      user_id: user.id,
      measured_at: at.toISOString(),
      local_date: localDate(profile?.timezone ?? "UTC", at),
      weight_kg: b.weightKg,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });

  if (b.photoPaths.length) {
    await supabase
      .from("photos")
      .insert(b.photoPaths.map((p) => ({ user_id: user.id, bucket: "body" as const, storage_path: p, weight_entry_id: data.id })));
  }
  return NextResponse.json({ id: data.id });
}
