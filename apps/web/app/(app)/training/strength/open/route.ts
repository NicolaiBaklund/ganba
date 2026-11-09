import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { openSession, sessionForActivity, StrengthError } from "@/lib/strength/sessions";
import { todayFor } from "@/lib/training/service";

/** "2026-02-31" is not a day. */
const realDate = (d: string) => {
  const t = Date.parse(`${d}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
};

/**
 * Opens the day's strength session (one per day; made when there is none) and goes to it: from the + menu
 * (today, or the past day being viewed), a planned strength day, or a Garmin strength activity (`activity`).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const u = await apiUser();
  if (!u) return NextResponse.redirect(new URL("/login", url.origin));
  const date = url.searchParams.get("date");
  const activity = url.searchParams.get("activity");
  try {
    const id = activity
      ? await sessionForActivity(u.user.id, activity)
      : await openSession(u.user.id, date && realDate(date) ? date : await todayFor(u.user.id));
    return NextResponse.redirect(new URL(`/training/strength/${id}`, url.origin));
  } catch (e) {
    if (e instanceof StrengthError) return NextResponse.redirect(new URL("/training", url.origin));
    throw e;
  }
}
