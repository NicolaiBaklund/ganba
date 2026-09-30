"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { addDays, type TrendPoint } from "@loop/core";
import { Chip } from "@/components/common/Chip";

type Range = "1m" | "3m" | "all";
const DAY_MS = 86_400_000;
const ts = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

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

  const { points, forecast, domain, xDomain, xTicks } = useMemo(() => {
    const from = range === "all" ? null : addDays(today, range === "1m" ? -30 : -90);
    const pts = trend.filter((p) => !from || p.date >= from).map((p) => ({ x: ts(p.date), weight: p.weightKg, trend: p.trendKg }));
    const last = pts.at(-1);
    // Show forecast only if the goal is reached within ~a year.
    const fc =
      last && etaDate && ts(etaDate) - last.x < 400 * DAY_MS
        ? [
            { x: last.x, forecast: last.trend },
            { x: ts(etaDate), forecast: goalKg },
          ]
        : [];
    const ys = [...pts.flatMap((p) => [p.weight, p.trend]), goalKg];
    const xs = [...pts.map((p) => p.x), ...fc.map((p) => p.x)];
    // Pad a single-day range so the axis doesn't collapse into duplicate ticks.
    const xPad = Math.max(...xs) === Math.min(...xs) ? 3 * DAY_MS : 0;
    return {
      points: pts,
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
          <ComposedChart margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
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
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }}
              labelFormatter={(x) => fmt(Number(x))}
              formatter={(v) => `${Number(v).toFixed(1)} kg`}
            />
            <ReferenceLine y={goalKg} stroke="var(--success)" strokeDasharray="4 4" />
            <Scatter data={points} dataKey="weight" fill="var(--muted-foreground)" fillOpacity={0.5} name={t("weight")} />
            <Line data={points} dataKey="trend" stroke="var(--primary)" strokeWidth={2.5} dot={false} type="monotone" name={t("trend")} />
            {forecast.length > 0 && (
              <Line data={forecast} dataKey="forecast" stroke="var(--primary)" strokeDasharray="5 5" dot={false} name={t("forecast")} />
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
