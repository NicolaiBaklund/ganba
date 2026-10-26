"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ISODate } from "@loop/core";
import type { RecoveryView } from "@/lib/recovery/view";
import { AskCoachLink } from "@/components/coach/AskCoachLink";
import { RecoveryCurves } from "./RecoveryCurves";
import { DaySheet } from "./DaySheet";
import { FormHero } from "./FormHero";
import { TonightRow } from "./TonightRow";
import { WeekTiles } from "./WeekTiles";
import { FormCurve } from "./FormCurve";

/**
 * The Form detail page (opened from the Form card on Today): the score with its drivers, last night, this week
 * and the curves. What it means and what the data has found is the coach's job.
 */
export function RecoveryScreen({ view, ai }: { view: RecoveryView; ai: boolean }) {
  const tc = useTranslations("coach");
  const [day, setDay] = useState<ISODate | null>(null);
  // The engine's own questions are proposed here (once a month at most), as the summary used to do.
  useEffect(() => {
    if (ai) void fetch("/api/recovery/questions", { method: "POST" }).catch(() => null);
  }, [ai]);
  return (
    <>
      {view.form && <FormHero form={view.form} ai={ai} />}
      <TonightRow curves={view.curves} today={view.today} onPick={setDay} />
      {view.form && <WeekTiles week={view.form.week} />}
      {view.form && <FormCurve points={view.form.curve} onPick={setDay} />}
      <RecoveryCurves curves={view.curves} onPick={setDay} />
      <DaySheet date={day} onClose={() => setDay(null)} whySlot={ai ? (d) => <AskCoachLink href={`/coach?day=${d}`} label={tc("aboutDay")} /> : undefined} />
    </>
  );
}
