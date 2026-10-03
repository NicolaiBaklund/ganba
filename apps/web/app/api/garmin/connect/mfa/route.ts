import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { GarminError, httpGarmin } from "@/lib/garmin/adapter";
import { takeMfaState } from "@/lib/garmin/accounts";
import { completeConnection } from "@/lib/garmin/connect";

export const maxDuration = 120;

const Body = z.object({ stateId: z.uuid(), code: z.string().trim().regex(/^\d{4,8}$/) });

export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const state = await takeMfaState(u.user.id, parsed.data.stateId);
  if (!state) return NextResponse.json({ error: "mfa_expired" }, { status: 400 });
  try {
    const res = await httpGarmin().loginMfa(state, parsed.data.code);
    await completeConnection(u.user.id, res.tokens);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const kind = e instanceof GarminError ? e.kind : "unavailable";
    return NextResponse.json({ error: kind }, { status: kind === "mfa_invalid" || kind === "auth" ? 400 : 503 });
  }
}
