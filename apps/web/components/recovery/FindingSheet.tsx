"use client";

import { useTranslations } from "next-intl";
import { BottomSheet } from "@/components/common/BottomSheet";
import { StatRow } from "@/components/tasuki/StatRow";
import { findingParams } from "@/lib/recovery/text";
import type { FindingRow } from "@/lib/recovery/view";

/** The two groups side by side: mean difference, how many days each, what was controlled for. */
export function FindingSheet({ finding, onClose }: { finding: FindingRow | null; onClose: () => void }) {
  const t = useTranslations("recovery");
  if (!finding) return <BottomSheet open={false} onOpenChange={onClose} title="">{null}</BottomSheet>;
  const p = findingParams(finding);
  const max = Math.max(Math.abs(finding.high.mean ?? 0), Math.abs(finding.low.mean ?? 0), 1);
  const bar = (m: number | null) => `${Math.round((Math.abs(m ?? 0) / max) * 100)}%`;
  return (
    <BottomSheet open onOpenChange={(o) => !o && onClose()} title={t(`metric.${finding.outcome}`)}>
      <div className="flex flex-col gap-4 pt-3">
        <p className="num text-[44px] font-black leading-none [font-stretch:62%]">{p.diff}</p>
        <div className="flex flex-col gap-3">
          {[
            { label: t(`factor.${finding.factor}.high`, { v: p.high }), g: finding.high },
            { label: t(`factor.${finding.factor}.low`, { v: p.low }), g: finding.low },
          ].map(({ label, g }) => (
            <div key={label}>
              <p className="text-[13px] font-semibold">{label}</p>
              <div className="mt-1 h-2.5 w-full bg-muted">
                <div className="h-full bg-foreground" style={{ width: bar(g.mean) }} />
              </div>
            </div>
          ))}
        </div>
        <StatRow items={[{ value: p.nHigh, label: t("daysHigh") }, { value: p.nLow, label: t("daysLow") }]} />
        {finding.controlOk && <p className="text-[13px] text-muted-foreground">{t("controlled")}</p>}
        {finding.source === "ai" && <p className="text-[13px] text-muted-foreground">{t("fromAi")}</p>}
      </div>
    </BottomSheet>
  );
}
