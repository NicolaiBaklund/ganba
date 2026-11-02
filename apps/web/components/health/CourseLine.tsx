import { daysBetween, type ISODate } from "@loop/core";
import type { ClockPoint } from "@/lib/health/view";

const W = 350;
const H = 74;
const BASE = 64;
const TOP = 8;
const PAD = 6;

/**
 * The road to the race in one line: solid and falling as the predicted time drops, a red dot for today, dashed on
 * to fitness tests (rings) and race day (a chequered flag). Without a race day the line ends at today.
 */
export function CourseLine({ line, today, raceDate, tests, label }: { line: ClockPoint[]; today: ISODate; raceDate: ISODate | null; tests: ISODate[]; label: string }) {
  if (line.length < 2) return null;
  const start = line[0]!.date;
  const end = raceDate && raceDate > today ? raceDate : today;
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
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-5 block h-auto w-full overflow-visible" role="img" aria-label={label}>
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
    </svg>
  );
}
