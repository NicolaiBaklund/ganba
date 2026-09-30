export const KCAL_PER_KG = 7700;
export const KCAL_FLOOR = { male: 1500, female: 1200 } as const;
export const SEDENTARY_FACTOR = 1.2;
/** Daily steps already covered by SEDENTARY_FACTOR. */
export const BASELINE_STEPS = 4000;
export const WALK_KCAL_PER_KG_PER_1000_STEPS = 0.4;
export const RUN_STEPS_PER_KM = 700;
/** Net of resting burn, which BMR · 1.2 already counts. */
export const RUN_NET_KCAL_PER_KG_KM = 0.9;
export const OTHER_TRAINING_MET = 5;
export const ESTIMATE_SPREAD = 0.07;
export const MAX_LOSS_PCT_PER_WEEK = 0.01;
export const MAX_GAIN_KG_PER_WEEK = 0.5;
export const DEFAULT_FAT_PCT = 0.25;
