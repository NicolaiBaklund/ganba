/** Circular distance between two weekdays (0 = Sunday). */
export const dayGap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 7;
  return Math.min(d, 7 - d);
};

/** Monday-first order, so ties go to earlier in the training week. */
const mondayFirst = (wd: number): number => (wd + 6) % 7;

export interface DayAssignment {
  long: number | null;
  hard: number[];
  easy: number[];
}

function pickSpread(candidates: number[], chosen: number[], count: number): number[] {
  const picked: number[] = [];
  const pool = [...candidates];
  for (let i = 0; i < count && pool.length; i++) {
    const anchors = [...chosen, ...picked];
    let best = pool[0]!;
    let bestScore = -1;
    for (const d of pool) {
      const score = anchors.length ? Math.min(...anchors.map((a) => dayGap(a, d))) : 7 - mondayFirst(d) / 7;
      if (score > bestScore || (score === bestScore && mondayFirst(d) < mondayFirst(best))) {
        best = d;
        bestScore = score;
      }
    }
    picked.push(best);
    pool.splice(pool.indexOf(best), 1);
  }
  return picked;
}

/**
 * Places a week's sessions on the allowed weekdays: the long run on the chosen day,
 * hard sessions as far from it (and each other) as possible, easy runs spread over the rest.
 */
export function assignDays(weekdays: number[], longRunWeekday: number, withLong: boolean, hardCount: number, easyCount: number): DayAssignment {
  const days = [...new Set(weekdays)].sort((a, b) => mondayFirst(a) - mondayFirst(b));
  let free = [...days];
  let long: number | null = null;
  if (withLong && free.length) {
    long = free.includes(longRunWeekday) ? longRunWeekday : free[free.length - 1]!;
    free = free.filter((d) => d !== long);
  }
  const hard = pickSpread(free, long == null ? [] : [long], Math.min(hardCount, free.length));
  free = free.filter((d) => !hard.includes(d));
  const easy = pickSpread(free, [...hard, ...(long == null ? [] : [long])], Math.min(easyCount, free.length));
  return { long, hard, easy };
}
