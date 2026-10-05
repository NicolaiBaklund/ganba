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
  // Bars grow from a centre line: left = below the person's normal, right = above.
  const bar = (m: number | null) => {
    const w = `${Math.round((Math.abs(m ?? 0) / max) * 50)}%`;
    return (m ?? 0) < 0 ? { right: "50%", width: w } : { left: "50%", width: w };
  };
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
              <div className="relative mt-1 h-2.5 w-full bg-muted">
                <span aria-hidden className="absolute inset-y-[-3px] left-1/2 w-px bg-muted-foreground" />
                <div className="absolute inset-y-0 bg-foreground" style={bar(g.mean)} />
              </div>
            </div>
          ))}
        </div>
        <p className="-mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{t("belowNormal")}</span>
          <span>{t("aboveNormal")}</span>
        </p>
        <StatRow items={[{ value: p.nHigh, label: t("daysHigh") }, { value: p.nLow, label: t("daysLow") }]} />
        {finding.controlOk && <p className="text-[13px] text-muted-foreground">{t("controlled")}</p>}
        {finding.source === "ai" && <p className="text-[13px] text-muted-foreground">{t("fromAi")}</p>}
      </div>
    </BottomSheet>
  );
}
