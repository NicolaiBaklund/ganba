export type Sex = "male" | "female";

export interface BodyStats {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
}

export interface ActivityBaseline {
  stepsPerDay: number;
  runKmPerWeek: number;
  otherTrainingHoursPerWeek: number;
}

export interface EnergyPlan {
  /** Expenditure without training. Training is added per day. */
  baseExpenditureKcal: number;
  proteinGPerKg: number;
  fatPct: number;
  manualKcalOverride: number | null;
}

export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface StartEstimate {
  bmr: number;
  baseKcal: number;
  walkingKcal: number;
  trainingKcal: number;
  maintenanceKcal: number;
  low: number;
  high: number;
}
