"use client";

import { useTranslations } from "next-intl";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, XAxis, YAxis } from "recharts";
import { useFormatter } from "next-intl";
import type { CurvePoint, ISODate } from "@loop/core";
import { SectionHead } from "@/components/tasuki/SectionHead";
import { useScrub } from "./useScrub";

type Key = "sleepScore" | "hrv" | "restingHr" | "runForm";
const ts = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

export function RecoveryCurves({ curves, onPick }: { curves: Record<Key, CurvePoint[]>; onPick: (date: ISODate) => void }) {
  const t = useTranslations("recovery");
  const format = useFormatter();
  const keys: Key[] = ["sleepScore", "hrv", "restingHr", "runForm"];
  // The last 7 mornings with data as buttons: the day sheet without needing to hit a chart point.
  const recent = [...new Set(keys.flatMap((k) => curves[k].map((p) => p.date)))].sort().slice(-7);
  if (!recent.length) return null;
  return (
    <section>
      <SectionHead title={t("curves")} />
      <div className="mt-2 flex gap-1" role="group" aria-label={t("pickDay")}>
        {recent.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onPick(d)}
            className="num min-w-0 flex-1 rounded-full bg-muted px-1 py-1.5 text-[13px] font-semibold active:bg-border"
          >
            {format.dateTime(new Date(`${d}T00:00:00Z`), { weekday: "short", timeZone: "UTC" })} {Number(d.slice(8))}
          </button>
        ))}
      </div>
      {keys.map((k) => (curves[k].length ? <MetricCurve key={k} k={k} points={curves[k]} onPick={onPick} /> : null))}
    </section>
  );
}

/** One metric: drag along it to read a day (value and date in the header); tap the date to open that day. */
function MetricCurve({ k, points, onPick }: { k: Key; points: CurvePoint[]; onPick: (date: ISODate) => void }) {
  const t = useTranslations("recovery");
  const format = useFormatter();
  const data = points.map((p) => ({ x: ts(p.date), date: p.date, v: p.value, band: p.low != null && p.high != null ? [p.low, p.high] : null }));
  const { selected, bind } = useScrub(data, { left: 4, right: 4 });
  const shown = selected ?? data.at(-1)!;
  return (
    <div className="border-b border-border py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-bold">{t(`metric.${k}`)}</p>
        <p className="flex items-baseline gap-2">
          {selected && (
            <button type="button" onClick={() => onPick(selected.date)} className="text-[13px] font-semibold text-primary">
              {format.dateTime(new Date(selected.x), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
            </button>
          )}
          <span className="num text-[17px] font-extrabold">{k === "runForm" ? shown.v.toFixed(1) : Math.round(shown.v)}</span>
        </p>
      </div>
      <div className="mt-1 h-16 w-full select-none" {...bind}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} hide />
            <YAxis domain={["auto", "auto"]} hide />
            <Area dataKey="band" stroke="none" fill="var(--muted)" isAnimationActive={false} />
            <Line dataKey="v" stroke="var(--foreground)" strokeWidth={2} dot={false} isAnimationActive={false} />
            {selected && <ReferenceLine x={selected.x} stroke="var(--muted-foreground)" strokeDasharray="3 3" />}
            <Scatter data={[shown]} dataKey="v" fill="var(--primary)" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
