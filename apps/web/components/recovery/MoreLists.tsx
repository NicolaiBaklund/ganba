"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { ListRow } from "@/components/tasuki/ListRow";
import { findingParams } from "@/lib/recovery/text";
import type { FindingRow } from "@/lib/recovery/view";
import { cn } from "@/lib/utils";

/** "No clear link" and "Needs more data", folded away by default. */
export function MoreLists({ noEffect, needsData }: { noEffect: FindingRow[]; needsData: FindingRow[] }) {
  const t = useTranslations("recovery");
  const [open, setOpen] = useState(false);
  if (!noEffect.length && !needsData.length) return null;
  const name = (f: FindingRow) => `${t(`factor.${f.factor}.high`, { v: findingParams(f).high })}: ${t(`metric.${f.outcome}`)}`;
  const status = (f: FindingRow) => {
    const p = findingParams(f);
    return f.reason === "few_days" ? t("progress", { have: p.have, needed: p.needed }) : t(f.reason === "training" ? "training" : "unclear");
  };
  return (
    <section className="mt-6">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-baseline justify-between border-b-2 border-foreground pb-1.5">
        <span className="cond text-[22px] leading-none">{t("more")}</span>
        <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          {!!noEffect.length && <p className="mt-3 text-[13px] font-bold">{t("noEffect")}</p>}
          {noEffect.map((f) => <ListRow key={f.questionId} title={name(f)} />)}
          {!!needsData.length && <p className="mt-3 text-[13px] font-bold">{t("needsData")}</p>}
          {needsData.map((f) => <ListRow key={f.questionId} title={name(f)} sub={status(f)} />)}
        </>
      )}
    </section>
  );
}
