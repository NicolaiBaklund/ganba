import { addDays, weekday, type ISODate } from "../dates";

/** How far back a missing Sunday may be filled from (spec 2026-11-18 §8). */
export const WEEK_BOUGHT = { fillDays: 3, weeks: 3 } as const;

/** The latest Sunday on or before a date. */
export const lastSunday = (d: ISODate): ISODate => addDays(d, -weekday(d));

/**
 * The change in the predicted race time per week, Sunday to Sunday, for the week ending on the latest Sunday on or
 * before `today` and the two before it (oldest first). A missing Sunday takes the nearest day up to 3 days earlier.
 * Null when this week's change can't be told.
 */
export function weekBought(preds: readonly { date: ISODate; s: number }[], today: ISODate): { weeks: { sunday: ISODate; deltaS: number }[] } | null {
  const by = new Map(preds.filter((p) => p.s > 0).map((p) => [p.date, p.s]));
  const on = (d: ISODate): number | null => {
    for (let k = 0; k <= WEEK_BOUGHT.fillDays; k++) {
      const v = by.get(addDays(d, -k));
      if (v != null) return v;
    }
    return null;
  };
  const end = lastSunday(today);
  const weeks: { sunday: ISODate; deltaS: number }[] = [];
  for (let k = WEEK_BOUGHT.weeks - 1; k >= 0; k--) {
    const sunday = addDays(end, -7 * k);
    const a = on(addDays(sunday, -7)), b = on(sunday);
    if (a != null && b != null) weeks.push({ sunday, deltaS: Math.round(b - a) });
  }
  return weeks.at(-1)?.sunday === end ? { weeks } : null;
}
