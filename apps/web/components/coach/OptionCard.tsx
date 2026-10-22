"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { changedWeek, type PlanWarning } from "@loop/core";
import { Button } from "@/components/ui/button";
import type { CoachOption } from "@/lib/coach/store";
import { cn } from "@/lib/utils";
import { WeekPreview } from "./WeekPreview";

/**
 * One suggestion: title and weekly km, the week drawn before/after (or the change list for older options),
 * warnings as short lines, and one button. A serious warning greys the button into "Use anyway".
 * `collapsed` = a second or third suggestion: title and warnings until opened.
 */
export function OptionCard({
  messageId,
  option,
  onChange,
  readOnly = false,
  collapsed = false,
}: {
  messageId: string;
  option: CoachOption;
  onChange: (o: CoachOption) => void;
  readOnly?: boolean;
  collapsed?: boolean;
}) {
  const t = useTranslations("coach");
  const format = useFormatter();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Opened by hand, or not folded (the folded flag can move here when the option above it goes away).
  const [opened, setOpened] = useState(false);
  const open = !collapsed || opened;
  const [details, setDetails] = useState(false);
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
      onChange({ ...option, status: "stale", warnings: body.warnings ?? [], weeks: body.weeks ?? option.weeks });
      return toast(t("changed"));
    }
    if (res?.status === 409 && body?.error === "invalid") return onChange({ ...option, status: "invalid", reason: body.reason });
    if (res?.status === 409 && body?.error === "not_pending") return onChange({ ...option, status: "applied" });
    if (res?.status === 409 && body?.error === "busy") return;
    toast.error(t("error"));
  }

  // Settled options: one line.
  if (option.status === "applied" || option.status === "not_used" || option.status === "invalid") {
    return (
      <p className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-[13px]">
        <span className="min-w-0 truncate font-semibold">{option.title}</span>
        <span className={cn("shrink-0", option.status === "applied" ? "font-semibold text-success" : "text-muted-foreground")}>
          {option.status === "applied" ? t("applied") : option.status === "not_used" ? t("notUsed") : t("invalid", { reason: option.reason ?? "" })}
        </span>
      </p>
    );
  }

  const week = changedWeek(option.weeks);
  const serious = option.warnings.some((w) => w.severity === "serious");
  const careful = serious || option.status === "stale";
  return (
    <section className="mt-3 border-t-2 border-foreground pt-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="cond text-[18px] leading-tight">{option.title}</p>
        {week && (
          <p className="num shrink-0 text-[13px] text-muted-foreground">
            {week.beforeKm === week.afterKm ? (
              `${week.afterKm} km`
            ) : (
              <>
                {week.beforeKm} → <span className={cn("font-bold", serious ? "text-primary" : "text-foreground")}>{week.afterKm} km</span>
              </>
            )}
          </p>
        )}
      </div>
      {open && option.summary && <p className="mt-0.5 text-[13px] text-muted-foreground">{option.summary}</p>}
      {open && (option.weeks?.length ? <WeekPreview weeks={option.weeks} /> : <Lines lines={option.lines} />)}
      {option.warnings.map((w, i) => (
        <p key={i} className={cn("mt-1.5 flex items-start gap-1.5 text-[13px] font-semibold", w.severity === "serious" ? "text-primary" : "text-warning")}>
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {text(w)}
        </p>
      ))}
      {option.status === "stale" && <p className="mt-1.5 text-[13px] text-muted-foreground">{t("changed")}</p>}
      {details && !!option.weeks?.length && <Lines lines={option.lines} />}
      <div className="mt-2.5 flex items-center gap-4">
        {!readOnly && (
          <Button className={cn("h-10 rounded-full px-5", careful && "bg-muted text-foreground hover:bg-muted")} disabled={busy} onClick={apply}>
            {careful ? t("useAnyway") : t("use")}
          </Button>
        )}
        {open ? (
          !!option.weeks?.length && (
            <button type="button" onClick={() => setDetails(!details)} className="text-[13px] font-semibold text-muted-foreground">
              {details ? t("hideDetails") : t("details")}
            </button>
          )
        ) : (
          <button type="button" onClick={() => setOpened(true)} className="text-[13px] font-semibold text-muted-foreground">
            {t("showWeek")}
          </button>
        )}
      </div>
    </section>
  );
}

function Lines({ lines }: { lines?: string[] }) {
  if (!lines?.length) return null;
  return (
    <ul className="mt-1.5">
      {lines.map((l, i) => (
        <li key={i} className="num text-[13px]">{l}</li>
      ))}
    </ul>
  );
}
