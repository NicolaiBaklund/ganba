import { addDays, daysBetween, type ISODate } from "@loop/core";
import type { ClockPoint } from "@/lib/health/view";

const W = 350;
const PAD = 6;

const endOf = (today: ISODate, raceDate: ISODate | null) => (raceDate && raceDate > today ? raceDate : today);

/** The date under a point on the line, as a fraction (0–1) of its width: for scrubbing along it. */
export function courseDateAt(line: ClockPoint[], today: ISODate, raceDate: ISODate | null, frac: number): ISODate {
  const start = line[0]!.date;
  const span = Math.max(1, daysBetween(start, endOf(today, raceDate)));
  const px = frac * W;
  return addDays(start, Math.round(((px - PAD) / (W - 2 * PAD)) * span));
}

/**
 * The road to the race in one line: solid and falling as the predicted time drops, a red dot for today, dashed on
 * to fitness tests (rings) and race day (a chequered flag). Without a race day the line ends at today. Compact: a thin
 * line for the top of Training. A cursor (a point on the line) marks the date being scrubbed.
 */
export function CourseLine({
  line,
  today,
  raceDate,
  tests,
  label,
  compact = false,
  cursor = null,
}: {
  line: ClockPoint[];
  today: ISODate;
  raceDate: ISODate | null;
  tests: ISODate[];
  label: string;
  compact?: boolean;
  cursor?: ClockPoint | null;
}) {
  if (line.length < 2) return null;
  const [H, BASE, TOP] = compact ? [44, 38, 4] : [74, 64, 8];
  const start = line[0]!.date;
  const end = endOf(today, raceDate);
  const span = Math.max(1, daysBetween(start, end));
  const x = (d: ISODate) => PAD + (daysBetween(start, d) / span) * (W - 2 * PAD);
  const secs = line.map((p) => p.seconds);
  const lo = Math.min(...secs), hi = Math.max(...secs);
  // Faster sits lower, so the line falls as the runner gets fitter; today's value rests on the base line.
  const y = (s: number) => (hi === lo ? BASE : BASE - ((s - lo) / (hi - lo)) * (BASE - TOP));
  const pts = line.map((p) => `${x(p.date).toFixed(1)},${y(p.seconds).toFixed(1)}`).join(" ");
  const nowX = x(line.at(-1)!.date);
  const nowY = y(line.at(-1)!.seconds);
  const flagX = raceDate && raceDate > today ? x(raceDate) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`${compact ? "mt-4" : "mt-5"} block h-auto w-full overflow-visible`} role="img" aria-label={label}>
      <polyline points={pts} fill="none" className="stroke-foreground" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {flagX != null && <line x1={nowX} y1={nowY} x2={flagX} y2={nowY} className="stroke-muted-foreground" strokeWidth={2} strokeDasharray="3 5" strokeLinecap="round" />}
      {tests
        .filter((d) => d > today && (!raceDate || d < raceDate))
        .map((d) => (
          <circle key={d} cx={x(d)} cy={nowY} r={5} className="fill-background stroke-foreground" strokeWidth={2} />
        ))}
      {flagX != null && (
        <g transform={`translate(${flagX - 1} ${nowY - 16})`}>
          {[0, 1, 2].flatMap((c) => [0, 1].map((r) => <rect key={`${c}${r}`} x={c * 4} y={r * 4} width={4} height={4} className={(c + r) % 2 ? "fill-background" : "fill-foreground"} />))}
          <rect x={0} y={0} width={12} height={8} fill="none" className="stroke-foreground" strokeWidth={1} />
          <line x1={0} y1={0} x2={0} y2={16} className="stroke-foreground" strokeWidth={1.5} />
        </g>
      )}
      <circle cx={nowX} cy={nowY} r={6} className="fill-primary" />
      {cursor && (
        <>
          <line x1={x(cursor.date)} y1={0} x2={x(cursor.date)} y2={H} className="stroke-muted-foreground" strokeWidth={1} />
          <circle cx={x(cursor.date)} cy={y(cursor.seconds)} r={5} className="fill-foreground stroke-background" strokeWidth={2} />
        </>
      )}
    </svg>
  );
}
