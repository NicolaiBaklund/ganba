"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, XAxis, YAxis } from "recharts";
import type { CurvePoint, ISODate } from "@loop/core";
import { SCRUB_INSET, useScrub } from "./useScrub";

const ts = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

/**
 * A day curve with the person's normal band. Tap a day → `onPick`; drag sideways to read days; "Open day" opens the
 * one shown (the latest until something is picked), so it also works without a pointer.
 */
export function ScrubCurve({
  points,
  onPick,
  title,
  format: fmtValue = (v) => String(Math.round(v)),
  height,
  yDomain = ["auto", "auto"],
}: {
  points: CurvePoint[];
  onPick: (d: ISODate) => void;
  title?: React.ReactNode;
  format?: (v: number) => string;
  height: number;
  yDomain?: [number | "auto", number | "auto"];
}) {
  const t = useTranslations("recovery");
  const format = useFormatter();
  const data = points.map((p) => ({ x: ts(p.date), date: p.date, v: p.value, band: p.low != null && p.high != null ? [p.low, p.high] : null }));
  const { selected, bind } = useScrub(data, (d) => onPick(d.date));
  const { style: touch, ...handlers } = bind;
  if (!data.length) return null;
  const shown = selected ?? data.at(-1)!;
  const day = format.dateTime(new Date(shown.x), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        {title}
        <p className="ml-auto flex items-baseline gap-2">
          <button type="button" onClick={() => onPick(shown.date)} className="text-[13px] font-semibold text-primary" aria-label={`${t("openDay")}, ${day}`}>
            {day}
          </button>
          <span className="num text-[17px] font-extrabold">{fmtValue(shown.v)}</span>
        </p>
      </div>
      <div className="mt-1 w-full cursor-pointer select-none" style={{ height, ...touch }} {...handlers}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 6, bottom: 0, ...SCRUB_INSET }}>
            <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} hide />
            <YAxis domain={yDomain} hide />
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
