import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { setAiHealthConsent } from "@/lib/recovery/consent";

const Body = z.object({ enabled: z.boolean() });

export async function PUT(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  await setAiHealthConsent(u.user.id, body.data.enabled);
  return NextResponse.json({ ok: true });
}
