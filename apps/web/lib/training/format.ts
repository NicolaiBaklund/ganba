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
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
}

const HR_LABEL: Record<string, string> = { z1: "Z1", z2: "Z2", z3: "Z3", ss: "Sweet spot", z4: "Z4", z5: "Z5" };
/** Pace range for running steps; heart-rate or power range for cycling steps. */
export const fmtPaceRange = (t: Target): string | null =>
  t.kind === "pace"
    ? `${formatPace(t.minSecPerKm)}–${formatPace(t.maxSecPerKm)} /km`
    : t.kind === "hr"
      ? `${HR_LABEL[t.zone]} ${t.minBpm}–${t.maxBpm} bpm`
      : t.kind === "power"
        ? `${HR_LABEL[t.zone]} ${t.minW}–${t.maxW} W`
        : null;
export const hrZoneLabel = (zone: string) => HR_LABEL[zone] ?? zone;

/** A plausible race pace: 2:30–12:00 per km. */
const RACE_PACE_S = { min: 150, max: 720 };

/**
 * A race time for a distance: "1:35:00", "1 35", "95", "25:30". Two numbers can mean h:mm or mm:ss; the one
 * with a plausible pace for the distance wins ("1 35" is 1:35:00 for a half, "25 30" is 25:30 for a 5K; the
 * two readings differ 60-fold, so never both fit). Null when empty, unreadable or no plausible reading.
 */
export function parseRaceTime(s: string, km: number): number | null {
  const parts = s.trim().split(/[:.,\s]+/).filter(Boolean);
  if (!parts.length || parts.some((p) => !/^\d+$/.test(p))) return null;
  const n = parts.map(Number);
  const readings =
    n.length === 1 ? [n[0]! * 60] : n.length === 2 ? [n[0]! * 60 + n[1]!, n[0]! * 3600 + n[1]! * 60] : n.length === 3 ? [n[0]! * 3600 + n[1]! * 60 + n[2]!] : [];
  return readings.find((t) => t / km >= RACE_PACE_S.min && t / km <= RACE_PACE_S.max) ?? null;
}

/**
 * Formats typed digits as a clock while typing, so a number pad is enough:
 * "4700" → "47:00", "14500" → "1:45:00". Input that already has separators is kept as typed.
 */
export function clockInput(raw: string): string {
  if (/[:.,\s]/.test(raw)) return raw.replace(/[^\d:.,\s]/g, "").slice(0, 8);
  const d = raw.replace(/\D/g, "").slice(0, 6);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, -2)}:${d.slice(-2)}`;
  return `${d.slice(0, -4)}:${d.slice(-4, -2)}:${d.slice(-2)}`;
}

/** Garmin speed (m/s) → s/km. */
export const paceFromSpeed = (mps: number | null | undefined): number | null => (mps && mps > 0 ? 1000 / mps : null);

/** Big bib number for a session: "5×1" + "km" from "Intervals 5 × 1 km", else the planned km. */
export function bibNumber(title: string, km: number, ride?: { durationS: number }): { big: string; unit: string } {
  const m = title.match(/(\d+)\s*[×x]\s*(\d+(?:\.\d+)?)\s*(km|m|min)\b/);
  // Endurance and long rides are about their length, even with "3 × 10 min tempo" inside.
  const lengthRide = ride && /^(Endurance|Recovery|Long)/.test(title);
  if (m && !lengthRide) return { big: `${m[1]}×${m[2]}`, unit: m[3]! };
  // Rides are time-based: the big number is the duration.
  if (ride) {
    const min = Math.round(ride.durationS / 300) * 5;
    return min >= 60 ? { big: `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`, unit: "h" } : { big: String(min), unit: "min" };
  }
  return { big: String(km), unit: "km" };
}

/** Message key for a session type: rides have their own names ("Long ride", "Endurance"). */
export const typeKey = (type: string, sport: "run" | "ride" = "run") => (sport === "ride" ? `rideTypes.${type}` : `types.${type}`);
