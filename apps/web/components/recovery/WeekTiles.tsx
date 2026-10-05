"use client";

import { useTranslations } from "next-intl";
import type { WeekBalance } from "@loop/core";
import { SectionHead } from "@/components/tasuki/SectionHead";
import { signed } from "@/lib/recovery/text";
import { cn } from "@/lib/utils";


function Tile({ big, label, tone, fill }: { big: string; label: string; tone?: "good" | "warn" | "bad"; fill: number | null }) {
  const color = tone === "good" ? "var(--success)" : tone === "warn" ? "var(--warning)" : tone === "bad" ? "var(--primary)" : "var(--foreground)";
  return (
    <div>
      <p className={cn("num text-[32px] font-extrabold leading-none [font-stretch:62%]", fill == null && "text-muted-foreground")} style={fill == null ? undefined : { color }}>
        {big}
      </p>
      <p className="mt-1 text-[12px] leading-tight text-muted-foreground">{label}</p>
      <div className="mt-2 h-[5px] bg-muted">{fill != null && <div className="h-full" style={{ width: `${Math.round(fill * 100)}%`, background: color }} />}</div>
    </div>
  );
}

/** This week at a glance: sleep vs need, fuel on hard days, load vs usual, run form trend. */
export function WeekTiles({ week }: { week: WeekBalance }) {
  const t = useTranslations("recovery.form");
  const w = week;
  // Nothing to show yet (new user): no wall of dashes.
  if (w.sleepVsNeedH == null && w.hardDayDeficit == null && w.loadRatio == null && w.runTrendPct == null) return null;
  const loadWord = w.loadRatio == null ? null : w.loadRatio > 1.3 ? "high" : w.loadRatio < 0.8 ? "low" : "normal";
  return (
    <section>
      <SectionHead title={t("week")} />
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
        <Tile
          big={w.sleepVsNeedH == null ? "–" : `${signed(w.sleepVsNeedH, 1)} h`}
          label={w.sleepVsNeedH == null ? t("tile.none") : t("tile.sleep")}
          tone={w.sleepVsNeedH == null ? undefined : w.sleepVsNeedH >= -3.5 ? "good" : w.sleepVsNeedH >= -10 ? "warn" : "bad"}
          fill={w.sleepVsNeedH == null ? null : Math.min(1, Math.abs(w.sleepVsNeedH) / 14)}
        />
        <Tile
          big={w.hardDayDeficit == null ? "–" : signed(-w.hardDayDeficit)}
          label={w.hardDayDeficit == null ? t("tile.fuelNone") : t("tile.fuel")}
          tone={w.hardDayDeficit == null ? undefined : w.hardDayDeficit > 700 ? "bad" : w.hardDayDeficit > 300 ? "warn" : "good"}
          fill={w.hardDayDeficit == null ? null : Math.min(1, Math.max(0, w.hardDayDeficit) / 1200)}
        />
        <Tile
          big={w.loadRatio == null ? "–" : `${w.loadRatio.toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`}
          label={loadWord ? `${t("tile.load")}, ${t(`tile.loadWord.${loadWord}`)}` : t("tile.none")}
          tone={loadWord === "high" ? "bad" : loadWord === "normal" ? undefined : loadWord ? "good" : undefined}
          fill={w.loadRatio == null ? null : Math.min(1, w.loadRatio / 2)}
        />
        <Tile
          big={w.runTrendPct == null ? "–" : `${signed(w.runTrendPct)} %`}
          label={w.runTrendPct == null ? t("tile.none") : t("tile.run")}
          tone={w.runTrendPct == null ? undefined : w.runTrendPct > 0 ? "good" : w.runTrendPct < 0 ? "bad" : undefined}
          fill={w.runTrendPct == null ? null : Math.min(1, Math.max(0, 0.5 + w.runTrendPct / 20))}
        />
      </div>
    </section>
  );
}
