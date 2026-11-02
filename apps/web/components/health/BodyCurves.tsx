"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CurvePoint, ISODate } from "@loop/core";
import { AskCoachLink } from "@/components/coach/AskCoachLink";
import { DaySheet } from "@/components/recovery/DaySheet";
import { RecoveryCurves } from "@/components/recovery/RecoveryCurves";
import { TonightRow } from "@/components/recovery/TonightRow";

type Curves = Record<"sleepScore" | "hrv" | "restingHr", CurvePoint[]>;

/** Last night and the 30-day curves for sleep, HRV and resting HR; tap a day for its sheet. */
export function BodyCurves({ curves, today, ai }: { curves: Curves; today: ISODate; ai: boolean }) {
  const tc = useTranslations("coach");
  const t = useTranslations("health");
  const [day, setDay] = useState<ISODate | null>(null);
  return (
    <section className="mt-10">
      <div className="border-b-2 border-foreground pb-1.5">
        <h2 className="cond text-[22px] leading-none">{t("body")}</h2>
      </div>
      <TonightRow curves={curves} today={today} onPick={setDay} />
      <RecoveryCurves curves={curves} onPick={setDay} />
      <DaySheet date={day} onClose={() => setDay(null)} whySlot={ai ? (d) => <AskCoachLink href={`/coach?day=${d}`} label={tc("aboutDay")} /> : undefined} />
    </section>
  );
}
