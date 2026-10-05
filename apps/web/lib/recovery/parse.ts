import "server-only";
import type { Json } from "@/lib/db/types";
import type { GarminNightRaw } from "@/lib/garmin/adapter";

interface SleepDto {
  calendarDate?: string | null;
  sleepTimeSeconds?: number | null;
  deepSleepSeconds?: number | null;
  lightSleepSeconds?: number | null;
  remSleepSeconds?: number | null;
  awakeSleepSeconds?: number | null;
  sleepStartTimestampGMT?: number | null;
  sleepEndTimestampGMT?: number | null;
  sleepScores?: { overall?: { value?: number | null } | null } | null;
  /** Minutes Garmin says this night needed. */
  sleepNeed?: { actual?: number | null } | null;
}
interface SleepRaw {
  dailySleepDTO?: SleepDto | null;
  restingHeartRate?: number | null;
  avgOvernightHrv?: number | null;
  hrvStatus?: string | null;
  bodyBatteryChange?: number | null;
}
interface HrvRaw {
  hrvSummary?: { lastNightAvg?: number | null; status?: string | null; baseline?: { balancedLow?: number | null; balancedUpper?: number | null } | null } | null;
}

const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
const iso = (ms: unknown) => (typeof ms === "number" && ms > 0 ? new Date(ms).toISOString() : null);
/** Top-level fields without the per-minute series (large, unused). */
const slim = (o: unknown) =>
  o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([, v]) => !Array.isArray(v))) : null;

/** One night → a recovery_days row keyed to the morning you wake up; null when the watch recorded no sleep. */
export function toRecoveryRow(userId: string, n: GarminNightRaw) {
  const s = (n.sleep ?? {}) as SleepRaw;
  const dto = s.dailySleepDTO;
  if (!dto?.sleepTimeSeconds) return null;
  const h = ((n.hrv ?? {}) as HrvRaw).hrvSummary ?? null;
  return {
    user_id: userId,
    local_date: dto.calendarDate ?? n.date,
    sleep_s: int(dto.sleepTimeSeconds),
    deep_s: int(dto.deepSleepSeconds),
    light_s: int(dto.lightSleepSeconds),
    rem_s: int(dto.remSleepSeconds),
    awake_s: int(dto.awakeSleepSeconds),
    sleep_score: int(dto.sleepScores?.overall?.value),
    sleep_need_s: typeof dto.sleepNeed?.actual === "number" ? Math.round(dto.sleepNeed.actual * 60) : null,
    sleep_start: iso(dto.sleepStartTimestampGMT),
    sleep_end: iso(dto.sleepEndTimestampGMT),
    hrv_avg: int(h?.lastNightAvg ?? s.avgOvernightHrv),
    hrv_baseline_low: int(h?.baseline?.balancedLow),
    hrv_baseline_high: int(h?.baseline?.balancedUpper),
    hrv_status: h?.status ?? s.hrvStatus ?? null,
    resting_hr: int(s.restingHeartRate),
    body_battery_charged: int(s.bodyBatteryChange),
    raw: { sleep: slim(n.sleep), hrv: slim(n.hrv) } as unknown as Json,
  };
}
