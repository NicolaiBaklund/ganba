"use client";

import { useTranslations } from "next-intl";
import type { CurvePoint, ISODate } from "@loop/core";
import { SectionHead } from "@/components/tasuki/SectionHead";
import { ScrubCurve } from "./ScrubCurve";

/** Form over 30 days with the person's normal band; tap a day to open it, drag to read days. */
export function FormCurve({ points, onPick }: { points: CurvePoint[]; onPick: (d: ISODate) => void }) {
  const t = useTranslations("recovery");
  if (points.length < 2) return null;
  return (
    <section>
      <SectionHead title={t("form.curve")} />
      <div className="mt-2">
        <ScrubCurve points={points} onPick={onPick} height={96} yDomain={[0, 100]} />
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">{t("scrubHint")}</p>
    </section>
  );
}
