"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { addDays, type TrendPoint } from "@loop/core";
import { Chip } from "@/components/common/Chip";

type Range = "1m" | "3m" | "all";
const DAY_MS = 86_400_000;
const ts = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
type Row = { x: number; weight: number | null; trend: number | null; forecast: number | null };
const ORDER = ["weight", "trend", "forecast"] as const;

export function WeightChart({
  trend,
  goalKg,
  today,
  etaDate,
}: {
  trend: TrendPoint[];
  goalKg: number;
  today: string;
  etaDate: string | null;
}) {
  const t = useTranslations("body");
  const [range, setRange] = useState<Range>("1m");
  const format = useFormatter();

  const { points, rows, forecast, domain, xDomain, xTicks } = useMemo(() => {
    const from = range === "all" ? null : addDays(today, range === "1m" ? -30 : -90);
    const pts = trend.filter((p) => !from || p.date >= from).map((p) => ({ x: ts(p.date), weight: p.weightKg, trend: p.trendKg }));
    const last = pts.at(-1);
    // Show forecast only if the goal is reached after the last weigh-in and within ~a year.
    const fc =
      last && etaDate && ts(etaDate) > last.x && ts(etaDate) - last.x < 400 * DAY_MS
        ? [
            { x: last.x, forecast: last.trend },
            { x: ts(etaDate), forecast: goalKg },
          ]
        : [];
    const ys = [...pts.flatMap((p) => [p.weight, p.trend]), goalKg];
    const xs = [...pts.map((p) => p.x), ...fc.map((p) => p.x)];
    // Pad a single-day range so the axis doesn't collapse into duplicate ticks.
    const xPad = Math.max(...xs) === Math.min(...xs) ? 3 * DAY_MS : 0;
    // One row per day on the chart itself, so a tap shows that day's weigh-in and trend together. The forecast line
    // starts at the last row (its value is that day's trend, so the tooltip leaves it out there) and ends at the goal.
    const rows: Row[] = [...pts.map((p) => ({ ...p, forecast: null })), ...(fc.length ? [{ x: fc[1]!.x, weight: null, trend: null, forecast: fc[1]!.forecast }] : [])];
    if (fc.length) rows[pts.length - 1]!.forecast = fc[0]!.forecast;
    return {
      points: pts,
      rows,
      forecast: fc,
      xDomain: [Math.min(...xs) - xPad, Math.max(...xs) + xPad] as [number, number],
      // Explicit, de-duplicated day ticks (series share x values, so auto ticks can repeat).
      xTicks: [...new Set([0, 1, 2, 3].map((i) => {
        const lo = Math.min(...xs) - xPad, hi = Math.max(...xs) + xPad;
        return Math.round((lo + ((hi - lo) * i) / 3) / DAY_MS) * DAY_MS;
      }))],
      domain: [Math.floor(Math.min(...ys) - 1), Math.ceil(Math.max(...ys) + 1)] as [number, number],
    };
  }, [trend, range, today, etaDate, goalKg]);

  if (!points.length) return <p className="py-10 text-center text-sm text-muted-foreground">{t("noData")}</p>;

  const fmt = (x: number) => format.dateTime(new Date(x), { day: "numeric", month: "short" });

  return (
    <div>
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={xDomain}
              ticks={xTicks}
              tickFormatter={fmt}
              stroke="var(--muted-foreground)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              minTickGap={30}
            />
            <YAxis domain={domain} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip
              content={({ active, payload, label }) => {
                const row = payload?.[0]?.payload as Row | undefined;
                if (!active || !row) return null;
                // The forecast's first point is the trend repeated: only show it where there is no trend.
                const items = ORDER.filter((k) => row[k] != null && !(k === "forecast" && row.trend != null));
                return (
                  <div className="rounded-xl border border-border bg-popover px-3 py-2 text-[13px]">
                    <p className="font-semibold">{fmt(Number(label))}</p>
                    {items.map((k) => (
                      <p key={k} className={k === "forecast" ? "text-primary" : k === "weight" ? "text-muted-foreground" : ""}>
                        {t(k)}: {row[k]!.toFixed(1)} kg
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            <ReferenceLine y={goalKg} stroke="var(--success)" strokeDasharray="4 4" />
            {/* Weigh-ins as dots on a stroke-less line: same row as the trend, and no "x" entry in the tooltip. */}
            <Line dataKey="weight" stroke="none" dot={{ r: 4, fill: "var(--muted-foreground)", fillOpacity: 0.4, stroke: "none" }} activeDot={{ r: 5 }} isAnimationActive={false} name={t("weight")} />
            <Line dataKey="trend" stroke="var(--foreground)" strokeWidth={2.5} dot={false} type="monotone" name={t("trend")} />
            {forecast.length > 0 && (
              <Line dataKey="forecast" stroke="var(--primary)" strokeDasharray="5 5" dot={false} connectNulls name={t("forecast")} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex gap-2">
        {(["1m", "3m", "all"] as const).map((r) => (
          <Chip key={r} selected={range === r} onClick={() => setRange(r)} className="h-8 px-3 text-xs">
            {t(`range.${r}`)}
          </Chip>
        ))}
      </div>
    </div>
  );
}
