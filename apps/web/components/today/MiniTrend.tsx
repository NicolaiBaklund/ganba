import type { TrendPoint } from "@loop/core";

/** Tiny sparkline of the trend weight. Plain SVG, no chart lib needed here. */
export function MiniTrend({ trend }: { trend: TrendPoint[] }) {
  if (trend.length < 2) return null;
  const w = 300, h = 48, pad = 4;
  const vals = trend.map((p) => p.trendKg);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 h-12 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${last[0]},${h} L${pts[0]![0]},${h} Z`} fill="url(#trendFill)" />
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
