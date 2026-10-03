import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { GarminError, httpGarmin } from "@/lib/garmin/adapter";
import { deleteGarminAccount, loadTokens, saveMfaState } from "@/lib/garmin/accounts";
import { completeConnection } from "@/lib/garmin/connect";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const maxDuration = 120;

const Body = z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) });

const errorStatus = (kind: string) => (kind === "auth" || kind === "mfa_invalid" ? 400 : kind === "rate_limited" ? 429 : 503);

// The password is passed straight to the adapter and never stored or logged.
export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  try {
    const res = await httpGarmin().login(parsed.data.email, parsed.data.password);
    if ("mfa" in res) return NextResponse.json({ mfa: true, stateId: await saveMfaState(u.user.id, res.mfaState) });
    await completeConnection(u.user.id, res.tokens);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const kind = e instanceof GarminError ? e.kind : "unavailable";
    return NextResponse.json({ error: kind }, { status: errorStatus(kind) });
  }
}

/** Disconnect: remove our planned sessions from the Garmin calendar (best effort), then the tokens. Synced data stays. */
export async function DELETE() {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tokens = await loadTokens(u.user.id);
  const db = createAdminSupabase();
  if (tokens) {
    const { data: pushed } = await db
      .from("planned_workouts")
      .select("id, garmin_workout_id, garmin_schedule_id")
      .eq("user_id", u.user.id)
      .not("garmin_workout_id", "is", null)
      .limit(30);
    const garmin = httpGarmin();
    for (const w of pushed ?? []) await garmin.deleteWorkout(tokens, w.garmin_workout_id!, w.garmin_schedule_id).catch(() => null);
  }
  await db.from("planned_workouts").update({ garmin_workout_id: null, garmin_schedule_id: null, garmin_push_status: "none" }).eq("user_id", u.user.id);
  await deleteGarminAccount(u.user.id);
  return NextResponse.json({ ok: true });
}
