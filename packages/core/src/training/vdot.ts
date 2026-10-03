import type { Paces } from "./types";

/** Oxygen cost (ml/kg/min) of running at v metres per minute (Daniels & Gilbert). */
export const vo2AtSpeed = (v: number): number => -4.6 + 0.182258 * v + 0.000104 * v * v;

/** Fraction of VO2max sustainable for t minutes. */
export const sustainableFraction = (t: number): number =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);

/** VDOT from a performance: distance in metres, time in seconds. */
export function vdotFrom(distanceM: number, timeS: number): number {
  const t = timeS / 60;
  return vo2AtSpeed(distanceM / t) / sustainableFraction(t);
}

/** Speed (m/min) whose oxygen cost equals `vo2`. */
export function speedForVo2(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

const secPerKm = (v: number): number => Math.round(60000 / v);

/** Predicted race time in seconds for a distance at a given VDOT. */
export function predictTimeS(distanceM: number, vdot: number): number {
  let lo = 60;
  let hi = 60 * 60 * 12;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFrom(distanceM, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

/** Training paces in seconds per km. Higher fraction = faster. */
export function pacesFor(vdot: number): Paces {
  const at = (f: number) => secPerKm(speedForVo2(vdot * f));
  return {
    easy: { min: at(0.74), max: at(0.65) },
    marathon: Math.round(predictTimeS(42195, vdot) / 42.195),
    threshold: at(0.88),
    interval: at(0.975),
    rep: at(1.05),
  };
}

export const formatPace = (sPerKm: number): string => {
  const s = Math.round(sPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
