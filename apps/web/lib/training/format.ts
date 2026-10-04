import { formatPace, type Target, type WorkoutType } from "@loop/core";

export const typeColor = (t: WorkoutType) => `var(--w-${t})`;

/** 3725 → "1:02:05", 1500 → "25:00". */
export function fmtClock(totalS: number): string {
  const s = Math.round(totalS);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** Rough duration for lists: "45 min", "1 h 20 min". */
export function fmtMinutes(totalS: number): string {
  const m = Math.round(totalS / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

export const fmtPaceRange = (t: Target): string | null =>
  t.kind === "pace" ? `${formatPace(t.minSecPerKm)}–${formatPace(t.maxSecPerKm)} /km` : null;

/** "1:45:00", "45:30" or "45" (minutes) → seconds; null when invalid. */
export function parseClock(s: string): number | null {
  const parts = s.trim().split(":").map((p) => p.trim());
  if (!parts.length || parts.some((p) => !/^\d+$/.test(p))) return null;
  const n = parts.map(Number);
  if (n.length === 1) return n[0]! * 60;
  if (n.length === 2) return n[0]! * 60 + n[1]!;
  if (n.length === 3) return n[0]! * 3600 + n[1]! * 60 + n[2]!;
  return null;
}

/** Garmin speed (m/s) → s/km. */
export const paceFromSpeed = (mps: number | null | undefined): number | null => (mps && mps > 0 ? 1000 / mps : null);

/** Big bib number for a session: "5×1" + "km" from "Intervals 5 × 1 km", else the planned km. */
export function bibNumber(title: string, km: number): { big: string; unit: string } {
  const m = title.match(/(\d+)\s*[×x]\s*(\d+(?:\.\d+)?)\s*(km|m|min)\b/);
  return m ? { big: `${m[1]}×${m[2]}`, unit: m[3]! } : { big: String(km), unit: "km" };
}
