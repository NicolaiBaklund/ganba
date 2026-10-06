"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, XAxis, YAxis } from "recharts";
import type { CurvePoint, ISODate } from "@loop/core";
import { SectionHead } from "@/components/tasuki/SectionHead";
import { useScrub } from "./useScrub";

const ts = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

/** Form over 30 days with the person's normal band. Drag along it to see a day; "Open day" → the day sheet. */
export function FormCurve({ points, onPick }: { points: CurvePoint[]; onPick: (d: ISODate) => void }) {
  const t = useTranslations("recovery");
  const format = useFormatter();
  const data = points.map((p) => ({ x: ts(p.date), date: p.date, v: p.value, band: p.low != null && p.high != null ? [p.low, p.high] : null }));
  const { selected, bind } = useScrub(data);
  if (points.length < 2) return null;
  const shown = selected ?? data.at(-1)!;
  return (
    <section>
      <SectionHead title={t("form.curve")} />
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {format.dateTime(new Date(shown.x), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
          <span className="num ml-2 text-[17px] font-extrabold text-foreground">{shown.v}</span>
        </p>
        <button type="button" onClick={() => onPick(shown.date)} className="text-[13px] font-semibold text-primary">
          {t("openDay")}
        </button>
      </div>
      <div className="mt-1 h-24 w-full select-none" {...bind}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
            <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} hide />
            <YAxis domain={[0, 100]} hide />
            <Area dataKey="band" stroke="none" fill="var(--muted)" isAnimationActive={false} />
            <Line dataKey="v" stroke="var(--foreground)" strokeWidth={2} dot={false} isAnimationActive={false} />
            {selected && <ReferenceLine x={selected.x} stroke="var(--muted-foreground)" strokeDasharray="3 3" />}
            <Scatter data={[shown]} dataKey="v" fill="var(--primary)" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {!selected && <p className="mt-1 text-[12px] text-muted-foreground">{t("scrubHint")}</p>}
    </section>
  );
}
