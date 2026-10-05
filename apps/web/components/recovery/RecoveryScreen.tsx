"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ISODate } from "@loop/core";
import type { RecoveryView } from "@/lib/recovery/view";
import { FindingsList } from "./FindingsList";
import { RecoveryCurves } from "./RecoveryCurves";
import { MoreLists } from "./MoreLists";
import { DaySheet } from "./DaySheet";
import { WhyButton } from "./WhyButton";
import { FormHero } from "./FormHero";
import { TonightRow } from "./TonightRow";
import { WeekTiles } from "./WeekTiles";
import { FormCurve } from "./FormCurve";

/** Glance first (Form, last night, this week, the curve), what the engine learned, then everything else folded. */
export function RecoveryScreen({ view, more, ai }: { view: RecoveryView; more?: React.ReactNode; ai: boolean }) {
  const t = useTranslations("recovery.form");
  const [day, setDay] = useState<ISODate | null>(null);
  const almost = view.needsData.filter((f) => f.reason === "unclear").length;
  return (
    <>
      {view.form && <FormHero form={view.form} ai={ai} />}
      <TonightRow curves={view.curves} today={view.today} onPick={setDay} />
      {view.form && <WeekTiles week={view.form.week} />}
      {view.form && <FormCurve points={view.form.curve} onPick={setDay} />}
      <FindingsList findings={view.findings} title={t("learnedTitle")}>
        <Progress found={view.findings.length} almost={almost} need={view.needsData.length - almost} />
      </FindingsList>
      <MoreLists noEffect={view.noEffect} needsData={view.needsData}>
        {more}
        <RecoveryCurves curves={view.curves} onPick={setDay} />
      </MoreLists>
      <DaySheet date={day} onClose={() => setDay(null)} whySlot={ai ? (d) => <WhyButton date={d} /> : undefined} />
    </>
  );
}

/** How far the engine has come: one segment per question, green found, amber almost, grey needs data. */
function Progress({ found, almost, need }: { found: number; almost: number; need: number }) {
  const t = useTranslations("recovery.form");
  if (!found && !almost && !need) return null;
  const segs = [...Array(found).fill("bg-success"), ...Array(almost).fill("bg-warning"), ...Array(need).fill("bg-muted")];
  return (
    <div className="pt-2.5">
      <p className="text-[13px] text-muted-foreground">{t("progress", { found, almost, need })}</p>
      <div className="mt-2 flex gap-1" aria-hidden>
        {segs.map((c, i) => (
          <span key={i} className={`h-1.5 flex-1 ${c}`} />
        ))}
      </div>
    </div>
  );
}
