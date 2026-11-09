import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { setFavourite, StrengthError } from "@/lib/strength/sessions";

const Body = z.object({ key: z.string().min(1).max(80), on: z.boolean() });

/** The star on an exercise. */
export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  try {
    await setFavourite(u.user.id, parsed.data.key, parsed.data.on);
  } catch (e) {
    if (e instanceof StrengthError) return NextResponse.json({ error: e.code }, { status: 400 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
