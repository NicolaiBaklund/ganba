"use client";

import { useTranslations } from "next-intl";
import { Area, ComposedChart, Line, ResponsiveContainer, Scatter, XAxis, YAxis } from "recharts";
import type { CurvePoint, ISODate } from "@loop/core";
import { SectionHead } from "@/components/tasuki/SectionHead";

const ts = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

/** Form over 30 days with the person's normal band; tap a day → the day sheet. */
export function FormCurve({ points, onPick }: { points: CurvePoint[]; onPick: (d: ISODate) => void }) {
  const t = useTranslations("recovery.form");
  if (points.length < 2) return null;
  const data = points.map((p) => ({ x: ts(p.date), date: p.date, v: p.value, band: p.low != null && p.high != null ? [p.low, p.high] : null }));
  return (
    <section>
      <SectionHead title={t("curve")} />
      <div className="mt-2 h-24 w-full">
        <ResponsiveContainer>
          <ComposedChart
            data={data}
            margin={{ top: 6, right: 6, bottom: 0, left: 6 }}
            onClick={(e) => {
              const i = Number(e?.activeIndex);
              if (Number.isInteger(i) && data[i]) onPick(data[i].date);
            }}
          >
            <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} hide />
            <YAxis domain={[0, 100]} hide />
            <Area dataKey="band" stroke="none" fill="var(--muted)" isAnimationActive={false} />
            <Line dataKey="v" stroke="var(--foreground)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Scatter data={[data.at(-1)]} dataKey="v" fill="var(--primary)" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
