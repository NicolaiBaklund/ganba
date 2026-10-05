import type { RecoveryFactor, RecoveryOutcome } from "./variables";

/** Factor on day D compared with the outcome on D + lag (night outcomes: lag 1 = the next morning). */
export interface RecoveryQuestion {
  id: string;
  factor: RecoveryFactor;
  transform: "tertile" | "binary";
  outcome: RecoveryOutcome;
  lag: 0 | 1;
}

const q = (id: string, factor: RecoveryFactor, transform: RecoveryQuestion["transform"], outcome: RecoveryOutcome, lag: 0 | 1): RecoveryQuestion => ({
  id,
  factor,
  transform,
  outcome,
  lag,
});

/** v1 catalog (spec §5.3): 13 factor–outcome groups = 21 tests. deficit3 on D covers D−2..D, so lag 1 = the run after three days. */
export const RECOVERY_QUESTIONS: readonly RecoveryQuestion[] = [
  q("deficit-sleep", "deficit", "tertile", "sleepScore", 1),
  q("deficit-hrv", "deficit", "tertile", "hrv", 1),
  q("deficit-rhr", "deficit", "tertile", "restingHr", 1),
  q("carbs-sleep", "carbs", "tertile", "sleepScore", 1),
  q("carbs-hrv", "carbs", "tertile", "hrv", 1),
  q("protein-sleep", "protein", "tertile", "sleepScore", 1),
  q("protein-hrv", "protein", "tertile", "hrv", 1),
  q("alcohol-sleep", "alcohol", "binary", "sleepScore", 1),
  q("alcohol-hrv", "alcohol", "binary", "hrv", 1),
  q("alcohol-rhr", "alcohol", "binary", "restingHr", 1),
  q("late-sleep", "late", "binary", "sleepScore", 1),
  q("hard-hrv", "hard", "binary", "hrv", 1),
  q("hard-rhr", "hard", "binary", "restingHr", 1),
  q("long-hrv", "long", "binary", "hrv", 1),
  q("long-rhr", "long", "binary", "restingHr", 1),
  q("steps-sleep", "steps", "tertile", "sleepScore", 1),
  q("sleep-run", "sleepScore", "tertile", "runForm", 0),
  q("hrv-run", "hrv", "tertile", "runForm", 0),
  q("carbs-run", "carbs", "tertile", "runForm", 1),
  q("deficit3-run", "deficit3", "tertile", "runForm", 1),
  q("rest-run", "daysSinceHard", "tertile", "runForm", 0),
];

const NIGHT_OUTCOMES = new Set<RecoveryOutcome>(["sleepScore", "hrv", "restingHr"]);
const TRAINING_FACTORS = new Set<RecoveryFactor>(["hard", "long"]);

/** Night outcomes whose factor is not training itself must survive without hard and long days. */
export const needsTrainingControl = (q: RecoveryQuestion): boolean => NIGHT_OUTCOMES.has(q.outcome) && !TRAINING_FACTORS.has(q.factor);
