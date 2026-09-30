import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/ai/crypto";

const Body = z.object({ key: z.string().trim().min(20).max(300) });

async function currentUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Never log or echo the key.
export async function PUT(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  const { key } = parsed.data;

  try {
    // Listing models is free and proves the key works.
    await new Anthropic({ apiKey: key, maxRetries: 0 }).models.list({ limit: 1 });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
      return NextResponse.json({ error: "invalid_key" }, { status: 400 });
    return NextResponse.json({ error: "validation_unavailable" }, { status: 503 });
  }

  const enc = encryptSecret(key);
  const last4 = key.slice(-4);
  const { error } = await createAdminSupabase()
    .from("api_keys")
    .upsert(
      {
        user_id: user.id,
        provider: "anthropic",
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        auth_tag: enc.authTag,
        last4,
        validated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  return NextResponse.json({ last4 });
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await createAdminSupabase().from("api_keys").delete().eq("user_id", user.id).eq("provider", "anthropic");
  return NextResponse.json({ ok: true });
}
