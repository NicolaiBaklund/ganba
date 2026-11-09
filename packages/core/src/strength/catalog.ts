/** How an exercise is measured: reps and kg, bodyweight reps (optional added kg), or seconds. */
export type Measure = "kg" | "bw" | "time";
/** Only used for the default increase step. */
export type Equipment = "barbell" | "machine" | "dumbbell" | "cable" | "bodyweight";
export type MuscleGroup = "chest" | "back" | "shoulders" | "arms" | "core" | "legs" | "runners";

export const MUSCLE_GROUPS: MuscleGroup[] = ["chest", "back", "shoulders", "arms", "core", "legs", "runners"];

export interface Exercise {
  key: string;
  name: string;
  group: MuscleGroup;
  measure: Measure;
  /** Null for the user's own exercises. */
  equipment: Equipment | null;
}

const ex = (key: string, name: string, group: MuscleGroup, equipment: Equipment, measure: Measure = "kg"): Exercise => ({ key, name, group, measure, equipment });

/** The built-in exercises (spec §5.1). Keys are stable: sets refer to them. */
export const EXERCISES: Exercise[] = [
  ex("bench-press", "Bench press", "chest", "barbell"),
  ex("incline-db-press", "Incline dumbbell press", "chest", "dumbbell"),
  ex("db-bench-press", "Dumbbell bench press", "chest", "dumbbell"),
  ex("chest-press", "Chest press machine", "chest", "machine"),
  ex("cable-fly", "Cable fly", "chest", "cable"),
  ex("push-ups", "Push-ups", "chest", "bodyweight", "bw"),
  ex("dips", "Dips", "chest", "bodyweight", "bw"),
  ex("pull-ups", "Pull-ups", "back", "bodyweight", "bw"),
  ex("chin-ups", "Chin-ups", "back", "bodyweight", "bw"),
  ex("lat-pulldown", "Lat pulldown", "back", "machine"),
  ex("seated-row", "Seated row", "back", "cable"),
  ex("barbell-row", "Barbell row", "back", "barbell"),
  ex("db-row", "One-arm dumbbell row", "back", "dumbbell"),
  ex("face-pull", "Face pull", "back", "cable"),
  ex("shoulder-press", "Shoulder press", "shoulders", "dumbbell"),
  ex("overhead-press", "Overhead press", "shoulders", "barbell"),
  ex("lateral-raise", "Lateral raise", "shoulders", "dumbbell"),
  ex("rear-delt-fly", "Rear delt fly", "shoulders", "dumbbell"),
  ex("bicep-curl", "Bicep curl", "arms", "dumbbell"),
  ex("hammer-curl", "Hammer curl", "arms", "dumbbell"),
  ex("barbell-curl", "Barbell curl", "arms", "barbell"),
  ex("tricep-pushdown", "Tricep pushdown", "arms", "cable"),
  ex("overhead-tricep", "Overhead tricep extension", "arms", "dumbbell"),
  ex("skull-crusher", "Skull crusher", "arms", "barbell"),
  ex("plank", "Plank", "core", "bodyweight", "time"),
  ex("hanging-leg-raise", "Hanging leg raise", "core", "bodyweight", "bw"),
  ex("cable-crunch", "Cable crunch", "core", "cable"),
  ex("ab-wheel", "Ab wheel", "core", "bodyweight", "bw"),
  ex("russian-twist", "Russian twist", "core", "bodyweight", "bw"),
  ex("squat", "Squat", "legs", "barbell"),
  ex("deadlift", "Deadlift", "legs", "barbell"),
  ex("leg-press", "Leg press", "legs", "machine"),
  ex("leg-curl", "Leg curl", "legs", "machine"),
  ex("leg-extension", "Leg extension", "legs", "machine"),
  ex("calf-raise", "Calf raise", "runners", "bodyweight", "bw"),
  ex("sl-rdl", "Single-leg Romanian deadlift", "runners", "dumbbell"),
  ex("lunge", "Lunge", "runners", "dumbbell"),
  ex("step-up", "Step-up", "runners", "dumbbell"),
  ex("glute-bridge", "Glute bridge", "runners", "bodyweight", "bw"),
  ex("side-plank", "Side plank", "runners", "bodyweight", "time"),
];

const BY_KEY = new Map(EXERCISES.map((e) => [e.key, e]));

/** A built-in exercise, or one of the user's own. */
export function exerciseByKey(key: string, custom: readonly Exercise[] = []): Exercise | null {
  return BY_KEY.get(key) ?? custom.find((e) => e.key === key) ?? null;
}
