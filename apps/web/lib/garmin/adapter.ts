import "server-only";

export type GarminErrorKind = "auth" | "mfa_invalid" | "rate_limited" | "unavailable" | "unsupported_session" | "bad_request";

export class GarminError extends Error {
  constructor(readonly kind: GarminErrorKind) {
    super(`garmin_${kind}`);
  }
}

/** Raw Garmin shapes, only the fields we read. Everything else is kept in `raw` columns. */
export interface GarminDayRaw {
  calendarDate: string;
  totalSteps: number | null;
  [k: string]: unknown;
}

export interface GarminActivityRaw {
  activityId: number;
  activityName?: string | null;
  startTimeLocal: string;
  startTimeGMT: string;
  activityType?: { typeKey?: string } | null;
  distance?: number | null;
  duration?: number | null;
  movingDuration?: number | null;
  averageHR?: number | null;
  maxHR?: number | null;
  steps?: number | null;
  elevationGain?: number | null;
  calories?: number | null;
  aerobicTrainingEffect?: number | null;
  anaerobicTrainingEffect?: number | null;
  [k: string]: unknown;
}

export interface FetchResult {
  days: GarminDayRaw[];
  activities: GarminActivityRaw[];
  details: Record<string, { splits: unknown; hrZones: unknown } | null>;
  /** Garmin's race predictor (seconds), when available. */
  racePredictions?: { time5K?: number | null; time10K?: number | null; timeHalfMarathon?: number | null; timeMarathon?: number | null } | null;
  /** Present only when Garmin refreshed them. */
  tokens: string | null;
}

/** One requested morning: Garmin's sleep and HRV payloads, null when Garmin had nothing. */
export interface GarminNightRaw {
  date: string;
  sleep: unknown;
  hrv: unknown;
}

export interface FetchRecoveryResult {
  nights: GarminNightRaw[];
  tokens: string | null;
}

export type LoginResult = { ok: true; tokens: string } | { mfa: true; mfaState: unknown };

/** Everything the app needs from Garmin. Tests swap in a fake. */
export interface GarminSource {
  login(email: string, password: string): Promise<LoginResult>;
  loginMfa(mfaState: unknown, code: string): Promise<{ ok: true; tokens: string }>;
  fetch(tokens: string, from: string, to: string, knownIds: number[]): Promise<FetchResult>;
  fetchRecovery(tokens: string, dates: string[]): Promise<FetchRecoveryResult>;
  pushWorkout(tokens: string, workout: unknown, date: string): Promise<{ workoutId: number; scheduleId: number | null; tokens: string | null }>;
  deleteWorkout(tokens: string, workoutId: number, scheduleId: number | null): Promise<{ tokens: string | null }>;
}

/** Same deployment's Python function. Production uses the public domain (deployment URLs sit behind Vercel auth). */
function adapterUrl(): string {
  if (process.env.GARMIN_ADAPTER_URL) return process.env.GARMIN_ADAPTER_URL;
  const host =
    process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_URL;
  return host ? `https://${host}/api/py/garmin` : "http://127.0.0.1:3200";
}

async function call<T>(body: Record<string, unknown>, timeoutMs = 110_000): Promise<T> {
  const secret = process.env.GARMIN_ADAPTER_SECRET;
  if (!secret) throw new GarminError("unavailable");
  const headers: Record<string, string> = { "content-type": "application/json", "x-adapter-secret": secret };
  // Preview deployments sit behind Vercel auth; this lets the server reach its own function.
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  let res: Response;
  try {
    res = await fetch(adapterUrl(), { method: "POST", headers, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new GarminError("unavailable");
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: GarminErrorKind }) | null;
  if (!res.ok || !json) throw new GarminError(json?.error ?? "unavailable");
  if (json.error) throw new GarminError(json.error);
  return json;
}

export const httpGarmin = (): GarminSource => ({
  login: (email, password) => call({ op: "login", email, password }),
  loginMfa: (mfaState, code) => call({ op: "login_mfa", mfaState, code }),
  fetch: (tokens, from, to, knownIds) => call({ op: "fetch", tokens, from, to, knownIds }),
  // Extra to the sync, so it must leave room within the 120 s function limit for the rest.
  fetchRecovery: (tokens, dates) => call({ op: "fetch_recovery", tokens, dates }, 40_000),
  pushWorkout: (tokens, workout, date) => call({ op: "push_workout", tokens, workout, date }),
  deleteWorkout: (tokens, workoutId, scheduleId) => call({ op: "delete_workout", tokens, workoutId, scheduleId }),
});
