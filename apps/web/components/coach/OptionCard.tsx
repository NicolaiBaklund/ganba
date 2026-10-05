"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PlanWarning } from "@loop/core";
import { Button } from "@/components/ui/button";
import type { CoachOption } from "@/lib/coach/store";
import { cn } from "@/lib/utils";

export function OptionCard({ messageId, option, onChange }: { messageId: string; option: CoachOption; onChange: (o: CoachOption) => void }) {
  const t = useTranslations("coach");
  const format = useFormatter();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const day = (d?: string) => (d ? format.dateTime(new Date(`${d}T00:00:00Z`), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "");
  const text = (w: PlanWarning) => t(`warning.${w.code}`, { date: day(w.date), week: day(w.week), before: w.before ?? 0, after: w.after ?? 0, pct: w.pct ?? 0 });

  async function apply() {
    setBusy(true);
    const res = await fetch(`/api/coach/options/${messageId}/${option.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: option.status === "stale" }),
    }).catch(() => null);
    setBusy(false);
    const body = await res?.json().catch(() => null);
    if (res?.ok) {
      onChange({ ...option, status: "applied" });
      router.refresh();
      return;
    }
    if (res?.status === 409 && body?.error === "changed") {
      onChange({ ...option, status: "stale", warnings: body.warnings ?? [] });
      return toast(t("changed"));
    }
    toast.error(t("error"));
  }

  const done = option.status === "applied" || option.status === "not_used";
  return (
    <section className={cn("mt-2 rounded-md border border-border bg-card p-3", done && "opacity-70")}>
      <p className="font-bold">{option.title}</p>
      {option.summary && <p className="mt-0.5 text-[13px] text-muted-foreground">{option.summary}</p>}
      {option.warnings.map((w, i) => (
        <p key={i} className={cn("mt-1.5 text-[13px] font-semibold", w.severity === "serious" ? "text-destructive" : "text-warning")}>
          {text(w)}
        </p>
      ))}
      {option.status === "stale" && <p className="mt-1.5 text-[13px] text-muted-foreground">{t("changed")}</p>}
      <div className="mt-2.5">
        {option.status === "applied" ? (
          <span className="text-[13px] font-semibold text-success">{t("applied")}</span>
        ) : option.status === "not_used" ? (
          <span className="text-[13px] text-muted-foreground">{t("notUsed")}</span>
        ) : (
          <Button className="h-10 px-5" disabled={busy} onClick={apply}>
            {option.status === "stale" ? t("applyAnyway") : t("apply")}
          </Button>
        )}
      </div>
    </section>
  );
}
