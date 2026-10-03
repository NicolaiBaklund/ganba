import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { syncGarmin } from "@/lib/garmin/sync";
import { afterGarminSync } from "@/lib/training/service";

export const maxDuration = 300;
const BUDGET_MS = 270_000;

/** Nightly (Vercel cron): finish yesterday for every connected user and keep 14 days of sessions on their watches. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const started = Date.now();
  const { data: accounts } = await createAdminSupabase()
    .from("garmin_accounts")
    .select("user_id")
    .eq("status", "active")
    .order("last_synced_at", { ascending: true, nullsFirst: true });
  const results: Record<string, number> = {};
  for (const a of accounts ?? []) {
    if (Date.now() - started > BUDGET_MS) break;
    const r = await syncGarmin(a.user_id, { afterSync: afterGarminSync });
    results[r.status] = (results[r.status] ?? 0) + 1;
  }
  return NextResponse.json({ users: accounts?.length ?? 0, results });
}
