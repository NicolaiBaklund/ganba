"use client";

import { useTranslations } from "next-intl";
import { useFormatter } from "next-intl";
import type { CurvePoint, ISODate } from "@loop/core";
import { SectionHead } from "@/components/tasuki/SectionHead";
import { ScrubCurve } from "./ScrubCurve";

type Key = "sleepScore" | "hrv" | "restingHr" | "runForm";

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

/** One metric: tap a day to open it, drag to read days. */
function MetricCurve({ k, points, onPick }: { k: Key; points: CurvePoint[]; onPick: (date: ISODate) => void }) {
  const t = useTranslations("recovery");
  return (
    <div className="border-b border-border py-3">
      <ScrubCurve
        points={points}
        onPick={onPick}
        height={64}
        title={<p className="font-bold">{t(`metric.${k}`)}</p>}
        format={(v) => (k === "runForm" ? v.toFixed(1) : String(Math.round(v)))}
      />
    </div>
  );
}
