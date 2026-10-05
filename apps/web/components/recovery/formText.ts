import type { FormBand, FormPart } from "@loop/core";

type T = (key: string, values?: Record<string, string | number>) => string;

const DRIVER_MIN = 2;

/** Biggest lifts and drags, as short names ("HRV and sleep"); parts under 2 points are noise here. */
export function drivers(parts: readonly FormPart[], t: T) {
  const ok = parts.filter((p) => p.status === "ok");
  const up = ok.filter((p) => p.points >= DRIVER_MIN).sort((a, b) => b.points - a.points).slice(0, 2);
  const down = ok.filter((p) => p.points <= -DRIVER_MIN).sort((a, b) => a.points - b.points).slice(0, 2);
  const list = (ps: FormPart[]) => {
    const names = ps.map((p) => t(`short.${p.id}`));
    return names.length === 2 ? t("drivers.and", { a: names[0]!, b: names[1]! }) : (names[0] ?? "");
  };
  return { up: list(up), down: list(down) };
}

/** The sentence without AI: band (with today's session), then what lifted and held back. */
export function formTemplate(score: { band: FormBand; parts: readonly FormPart[] }, workout: string | null, t: T): string {
  const lead = workout ? t("lead.workout", { band: score.band, workout }) : t("lead.rest", { band: score.band });
  const { up, down } = drivers(score.parts, t);
  const tail = up && down ? t("drivers.both", { up, down }) : up ? t("drivers.up", { up }) : down ? t("drivers.down", { down }) : "";
  return tail ? `${lead} ${tail}` : lead;
}

/** Detail line for one part in the "What counts" sheet. */
export function partDetail(p: FormPart, t: T): string {
  if (p.status === "missing") return t(`missing.${p.id}`);
  const v = p.values;
  const n = (x: number | null | undefined, d = 0) => (x == null ? "–" : x.toLocaleString("en", { maximumFractionDigits: d }));
  switch (p.id) {
    case "hrv":
      return t("detail.hrv", { hrv: n(v.hrv), low: n(v.low), high: n(v.high) });
    case "sleep":
      return v.hours != null ? t("detail.sleepHours", { score: n(v.score), hours: n(v.hours, 1) }) : t("detail.sleep", { score: n(v.score) });
    case "rhr":
      return t("detail.rhr", { rhr: n(v.rhr), normal: n(v.normal) });
    case "sleepDebt":
      return t("detail.sleepDebt", { hours: `${(v.hours ?? 0) > 0 ? "+" : (v.hours ?? 0) < 0 ? "−" : ""}${n(Math.abs(v.hours ?? 0), 1)}` });
    case "load":
      return t("detail.load", { ratio: n(v.ratio, 1) });
    case "energy":
      return (v.deficit ?? 0) >= 0 ? t("detail.energyUnder", { kcal: n(v.deficit) }) : t("detail.energyOver", { kcal: n(-(v.deficit ?? 0)) });
    case "carbs":
      return t("detail.carbs", { v: n(v.carbsPerKg, 1) });
    case "rest":
      return t("detail.rest", { days: n(v.days) });
  }
}
