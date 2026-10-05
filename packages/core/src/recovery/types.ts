import type { ISODate } from "../dates";

/**
 * One calendar day. Food and training describe day D; sleepScore/hrv/restingHr describe the
 * morning of D (the night before). Null = no data, never a filled-in average.
 */
export interface RecoveryDayInput {
  date: ISODate;
  sleepScore: number | null;
  hrv: number | null;
  restingHr: number | null;
  /** Null when D is not a logged food day. lateKcal null = meal times unknown (logged afterwards). */
  food: { deficitKcal: number; carbsPerKg: number; proteinPerKg: number; alcoholG: number; lateKcal: number | null } | null;
  hard: boolean;
  long: boolean;
  steps: number | null;
  /** Easy outdoor runs ≥ 20 min: metres per heartbeat (mean of the day's runs). */
  easyMetersPerBeat: number | null;
  /** Quality sessions: actual / planned pace of the hard parts (> 1 = slower). */
  qualityPaceRatio: number | null;
  /** For Form (optional so older callers still build inputs): night sleep and Garmin's need for it, seconds. */
  sleepS?: number | null;
  sleepNeedS?: number | null;
  /** Garmin's HRV normal range for that morning. */
  hrvLow?: number | null;
  hrvHigh?: number | null;
  /** Sum of Garmin training load for the day's activities: 0 = no activities, null = no watch data. */
  load?: number | null;
}
