"use client";

import { useTranslations } from "next-intl";
import { Area, ComposedChart, Line, ResponsiveContainer, Scatter, XAxis, YAxis } from "recharts";
import { useFormatter } from "next-intl";
import type { CurvePoint, ISODate } from "@loop/core";
import { SectionHead } from "@/components/tasuki/SectionHead";

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
      {keys.map((k) => {
        const pts = curves[k];
        if (!pts.length) return null;
        const last = pts.at(-1)!;
        const data = pts.map((p) => ({ x: ts(p.date), date: p.date, v: p.value, band: p.low != null && p.high != null ? [p.low, p.high] : null }));
        return (
          <div key={k} className="border-b border-border py-3">
            <div className="flex items-baseline justify-between">
              <p className="font-bold">{t(`metric.${k}`)}</p>
              <p className="num text-[17px] font-extrabold">{k === "runForm" ? last.value.toFixed(1) : Math.round(last.value)}</p>
            </div>
            <div className="mt-1 h-16 w-full">
              <ResponsiveContainer>
                <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} onClick={(e) => {
                    const i = Number(e?.activeIndex);
                    if (Number.isInteger(i) && data[i]) onPick(data[i].date);
                  }}>
                  <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} hide />
                  <YAxis domain={["auto", "auto"]} hide />
                  <Area dataKey="band" stroke="none" fill="var(--muted)" isAnimationActive={false} />
                  <Line dataKey="v" stroke="var(--foreground)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Scatter data={[data.at(-1)]} dataKey="v" fill="var(--primary)" isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </section>
  );
}
