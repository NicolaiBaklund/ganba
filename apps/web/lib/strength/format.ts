import type { Measure, SetRow } from "@loop/core";

const n = (x: number) => String(Math.round(x * 100) / 100);

/** "3 × 8 at 62.5 kg", "8, 8, 6 at 60 kg", "3 × 8, bodyweight", "3 × 8 + 5 kg", "3 × 45 s". */
export function setsLabel(sets: readonly SetRow[], measure: Measure): string {
  if (!sets.length) return "";
  if (measure === "time") {
    const secs = sets.map((s) => s.seconds ?? 0);
    return secs.every((s) => s === secs[0]) ? `${sets.length} × ${secs[0]} s` : `${secs.join(", ")} s`;
  }
  const reps = sets.map((s) => s.reps ?? 0);
  const count = reps.every((r) => r === reps[0]) ? `${sets.length} × ${reps[0]}` : reps.join(", ");
  const kgs = sets.map((s) => s.kg).filter((k): k is number => k != null && k > 0);
  if (!kgs.length) return measure === "bw" ? `${count}, bodyweight` : count;
  const lo = Math.min(...kgs), hi = Math.max(...kgs);
  const load = lo === hi ? `${n(lo)} kg` : `${n(lo)}–${n(hi)} kg`;
  return measure === "bw" ? `${count} + ${load}` : `${count} at ${load}`;
}

/** "Chest, back, arms". */
export const groupsLabel = (groups: readonly string[], name: (g: string) => string) => {
  const s = groups.map(name).join(", ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
