"use client";

import { useTranslations } from "next-intl";
import { BottomSheet } from "@/components/common/BottomSheet";
import { StatRow } from "@/components/tasuki/StatRow";
import { findingParams } from "@/lib/recovery/text";
import type { FindingRow } from "@/lib/recovery/view";

const W = 300;
const ROW = 34;

/**
 * The two groups day by day: every day is a dot (its outcome vs the person's normal), the mean a black tick,
 * the centre line is the normal. Rows stored before the points were kept fall back to the means only.
 */
export function FindingSheet({ finding, onClose }: { finding: FindingRow | null; onClose: () => void }) {
  const t = useTranslations("recovery");
  if (!finding) return <BottomSheet open={false} onOpenChange={onClose} title="">{null}</BottomSheet>;
  const p = findingParams(finding);
  const groups = [
    { label: t(`factor.${finding.factor}.high`, { v: p.high }), g: finding.high },
    { label: t(`factor.${finding.factor}.low`, { v: p.low }), g: finding.low },
  ];
  const all = groups.flatMap(({ g }) => [...(g.values ?? []), g.mean ?? 0]);
  const max = Math.max(1, ...all.map(Math.abs));
  const x = (v: number) => W / 2 + (v / max) * (W / 2 - 6);

  return (
    <BottomSheet open onOpenChange={(o) => !o && onClose()} title={t(`metric.${finding.outcome}`)}>
      <div className="flex flex-col gap-4 pt-3">
        <p className="num text-[44px] font-black leading-none [font-stretch:62%]">{p.diff}</p>
        <div className="flex flex-col gap-2">
          {groups.map(({ label, g }) => (
            <div key={label}>
              <p className="text-[13px] font-semibold">{label}</p>
              <svg viewBox={`0 0 ${W} ${ROW}`} className="mt-1 w-full" role="img" aria-label={`${label}: ${g.n}`}>
                <line x1={W / 2} x2={W / 2} y1={0} y2={ROW} stroke="var(--muted-foreground)" strokeWidth={1} />
                {(g.values ?? []).map((v, i) => (
                  <circle key={i} cx={x(v)} cy={ROW / 2 + (((i * 7) % 5) - 2) * 3} r={3.5} fill="var(--foreground)" opacity={0.35} />
                ))}
                {g.mean != null && <rect x={x(g.mean) - 1.5} y={2} width={3} height={ROW - 4} fill="var(--foreground)" />}
              </svg>
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
