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
}
