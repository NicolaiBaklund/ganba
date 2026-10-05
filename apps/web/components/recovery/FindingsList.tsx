"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ListRow } from "@/components/tasuki/ListRow";
import { SectionHead } from "@/components/tasuki/SectionHead";
import { findingParams } from "@/lib/recovery/text";
import type { FindingRow } from "@/lib/recovery/view";
import { FindingSheet } from "./FindingSheet";

/** One line per finding: "Deficit over 820 kcal: HRV −6 ms the next morning", with n under. Tap → sheet. */
export function FindingsList({ findings }: { findings: FindingRow[] }) {
  const t = useTranslations("recovery");
  const [open, setOpen] = useState<FindingRow | null>(null);
  return (
    <section>
      <SectionHead title={t("findings")} />
      {!findings.length && <p className="border-b border-border py-3 text-[13px] text-muted-foreground">{t("noFindings")}</p>}
      {findings.map((f) => {
        const p = findingParams(f);
        return (
          <ListRow
            key={f.questionId}
            onClick={() => setOpen(f)}
            title={`${t(`factor.${f.factor}.high`, { v: p.high })}: ${t(`outcome.${f.outcome}`, { diff: p.diff })}`}
            sub={`${f.lag > 1 ? t("when.later", { days: f.lag }) : t(`when.${f.lag === 1 ? "next" : "same"}`)}, ${t("nights", { high: p.nHigh, low: p.nLow })}${f.source === "ai" ? `, ${t("fromAi").toLowerCase()}` : ""}`}
            leading={<span aria-hidden className={p.better ? "h-8 w-1 bg-success" : "h-8 w-1 bg-primary"} />}
          />
        );
      })}
      <FindingSheet finding={open} onClose={() => setOpen(null)} />
    </section>
  );
}
