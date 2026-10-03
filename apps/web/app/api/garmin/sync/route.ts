import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { syncGarmin } from "@/lib/garmin/sync";
import { afterGarminSync } from "@/lib/training/service";

export const maxDuration = 120;

const FRESH_MS = 15 * 60_000;
const Body = z.object({ force: z.boolean().optional() });

/** App open (skips if synced < 15 min ago) or pull-to-refresh (force). */
export async function POST(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { force } = Body.parse((await req.json().catch(() => ({}))) ?? {});
  const status = await getGarminStatus(u.user.id);
  if (!status) return NextResponse.json({ status: "not_connected" });
  if (!force && status.lastSyncedAt && Date.now() - Date.parse(status.lastSyncedAt) < FRESH_MS)
    return NextResponse.json({ status: "fresh" });
  const outcome = await syncGarmin(u.user.id, { afterSync: afterGarminSync });
  return NextResponse.json(outcome);
}
