export type ISODate = string;

const toUTC = (d: ISODate) => new Date(`${d}T00:00:00Z`);
const fromUTC = (dt: Date): ISODate => dt.toISOString().slice(0, 10);

export const addDays = (d: ISODate, n: number): ISODate => {
  const dt = toUTC(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUTC(dt);
};

/** Whole days from a to b (b − a). */
export const daysBetween = (a: ISODate, b: ISODate): number =>
  Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);

/** Calendar date in the given IANA timezone. */
export const localDate = (tz: string, at: Date = new Date()): ISODate =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

/** 0 = Sunday. */
export const weekday = (d: ISODate): number => toUTC(d).getUTCDay();

/** Most recent date on or before `d` whose weekday is `wd`. */
export const weekStartOn = (d: ISODate, wd: number): ISODate =>
  addDays(d, -((weekday(d) - wd + 7) % 7));

export const ageOn = (birth: ISODate, on: ISODate): number => {
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const [oy, om, od] = on.split("-").map(Number) as [number, number, number];
  return oy - by - (om < bm || (om === bm && od < bd) ? 1 : 0);
};

const zonedParts = (tz: string, at: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: n("year"), mo: n("month"), d: n("day"), h: n("hour"), mi: n("minute"), s: n("second") };
};

/** Hour of day (0–23) in the given IANA timezone. */
export const localHour = (tz: string, at: Date): number => zonedParts(tz, at).h;

/** The instant a wall-clock time ("HH:MM") on `date` happens in `tz`. */
export function zonedTime(date: ISODate, hhmm: string, tz: string): Date {
  const wall = Date.parse(`${date}T${hhmm}:00Z`);
  const offset = (at: number) => {
    const p = zonedParts(tz, new Date(at));
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - at;
  };
  const first = wall - offset(wall);
  return new Date(wall - offset(first));
}
