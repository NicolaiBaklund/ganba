"use client";

import { useTranslations } from "next-intl";
import { FORM_RULES, type FormPart } from "@loop/core";
import { BottomSheet } from "@/components/common/BottomSheet";
import type { FormView } from "@/lib/recovery/view";
import { cn } from "@/lib/utils";
import { partDetail } from "./formText";

/** Widest a part can reach, for the bar (the HRV cap is the largest). */
const BAR_MAX = FORM_RULES.hrvMax;
const sign = (x: number) => (x > 0 ? `+${x}` : x < 0 ? `−${Math.abs(x)}` : "0");

/** "What counts": every part with its points from 50, learned parts marked, missing ones grey. */
export function FormSheet({ form, open, onClose }: { form: FormView; open: boolean; onClose: () => void }) {
  const t = useTranslations("recovery.form");
  const f = form.today;
  if (!f) return null;
  const color = (p: FormPart) => (p.points > 0 ? "var(--success)" : p.points < 0 ? "var(--primary)" : "var(--muted-foreground)");
  return (
    <BottomSheet open={open} onOpenChange={(o) => !o && onClose()} title={t("what")}>
      <div className="mt-1 flex items-baseline justify-between">
        <p className="num text-[34px] font-extrabold leading-none [font-stretch:62%]">
          {t("label")} {f.score}
        </p>
        <p className="text-[13px] text-muted-foreground">{t("from")}</p>
      </div>
      <ul className="mt-2">
        {f.parts.map((p) => {
          const pts = Math.round(p.points);
          const w = Math.min(50, (Math.abs(p.points) / BAR_MAX) * 50);
          return (
            <li key={p.id} className={cn("border-b border-border py-2.5", p.status === "missing" && "opacity-50")}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px] font-bold">
                  {t(`part.${p.id}`)}
                  {p.learned && <span className="ml-2 rounded-full bg-warning px-2 py-0.5 align-[2px] text-[11px] font-bold text-black">{t("learned")}</span>}
                </p>
                <p className="num text-[20px] font-extrabold" style={{ color: p.status === "ok" ? color(p) : undefined }}>
                  {p.status === "ok" ? sign(pts) : "–"}
                </p>
              </div>
              <p className="text-[13px] text-muted-foreground">{partDetail(p, t)}</p>
              {p.status === "ok" && (
                <div className="relative mt-1.5 h-1 bg-muted">
                  <span className="absolute -top-1 -bottom-1 left-1/2 w-px bg-muted-foreground" />
                  <span className="absolute inset-y-0" style={{ background: color(p), width: `${w}%`, left: p.points >= 0 ? "50%" : `${50 - w}%` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {form.selfCheck && (
        <p className="mt-4 border-l-[3px] border-success pl-3 text-[13px] text-muted-foreground">
          {t("selfCheck", {
            diff: Math.abs(form.selfCheck.diffSd).toFixed(1),
            dir: form.selfCheck.diffSd >= 0 ? "better" : "worse",
            high: form.selfCheck.nHigh,
            low: form.selfCheck.nLow,
          })}
        </p>
      )}
    </BottomSheet>
  );
}
