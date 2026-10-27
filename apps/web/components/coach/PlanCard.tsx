"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { changedWeek, type PreviewCell } from "@loop/core";
import { Bib } from "@/components/tasuki/Bib";
import type { CoachOption } from "@/lib/coach/store";
import { bibNumber, fmtMinutes, typeColor, typeKey } from "@/lib/training/format";
import { cn } from "@/lib/utils";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** Opens and closes its content by height, without a jump (and instantly with reduced motion). */
function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/**
 * A plan change from the coach, like an artifact: the title says what happens, the week shows it with the
 * changed days outlined, and tapping a day opens that session's bib in the card. One button. No warning lists:
 * the coach says what matters in its text (spec 2026-10-27 §7).
 */
export function PlanCard({
  messageId,
  option,
  open: openByDefault,
  readOnly = false,
  onChange,
}: {
  messageId: string;
  option: CoachOption;
  open: boolean;
  readOnly?: boolean;
  onChange: (o: CoachOption) => void;
}) {
  const t = useTranslations("coach");
  const tw = useTranslations("workout");
  const format = useFormatter();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<boolean | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const open = opened ?? openByDefault;
  const week = changedWeek(option.weeks);
  const otherWeeks = (option.weeks ?? []).filter((w) => w !== week && w.days.some((d) => d.changed)).length;
  const thisMonday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toLocaleDateString("en-CA");
  })();
  const weekLabel = (w: NonNullable<typeof week>) =>
    w.monday === thisMonday
      ? t("weekKm", { km: w.afterKm })
      : t("weekOfKm", { date: format.dateTime(new Date(`${w.monday}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" }), km: w.afterKm });
  // A day's session for its bib: the one that moved here, else the newest (an added session comes last).
  const sessionOf = (cells: PreviewCell[]) => cells.find((c) => c.fromDate) ?? cells.at(-1);
  const weekday = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { weekday: "long", timeZone: "UTC" });

  async function apply() {
    setBusy(true);
    const res = await fetch(`/api/coach/options/${messageId}/${option.id}`, { method: "POST" }).catch(() => null);
    setBusy(false);
    const body = await res?.json().catch(() => null);
    if (res?.ok) {
      setOpened(false);
      onChange({ ...option, status: "applied" });
      router.refresh();
      return;
    }
    if (res?.status === 409 && body?.error === "invalid") {
      // Keep the card open so the reason shows (the open default follows pending options only).
      setOpened(true);
      return onChange({ ...option, status: "invalid", reason: body.reason });
    }
    if (res?.status === 409 && body?.error === "not_pending") return onChange({ ...option, status: "applied" });
    if (res?.status === 409 && body?.error === "busy") return;
    toast.error(t("error"));
  }

  if (option.status === "not_used") return null;
  const applied = option.status === "applied";

  // The week row: the days after the change, changed ones outlined; tap one for its bib.
  const cells = week?.days ?? [];
  const picked = cells.find((d) => d.date === day);
  const session: PreviewCell | undefined = picked ? sessionOf(picked.after) : undefined;
  const body = (
    <>
      {week && (
        <div className="grid grid-cols-7 gap-1 px-3 pb-2.5 pt-1">
          {cells.map((d, i) => {
            // The day's total (runs in km, rides in minutes); the colour of the session that matters here.
            const c = sessionOf(d.after);
            const ride = c?.sport === "ride";
            const total = d.after.filter((x) => (x.sport === "ride") === ride).reduce((s, x) => s + (ride ? x.min : x.km), 0);
            const value = c ? (ride ? `${total}′` : (Math.round(total * 10) / 10).toLocaleString("en", { maximumFractionDigits: 1 })) : "";
            return (
              <button
                key={d.date}
                type="button"
                aria-label={format.dateTime(new Date(`${d.date}T00:00:00Z`), { weekday: "long", day: "numeric", timeZone: "UTC" })}
                aria-pressed={day === d.date}
                onClick={() => setDay(day === d.date ? null : d.date)}
                className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground"
              >
                {DAY_LETTERS[i]}
                <span
                  className={cn(
                    "relative flex h-9 w-full items-end justify-center overflow-hidden rounded-md bg-muted pb-1.5 font-bold text-foreground transition-transform duration-150",
                    d.changed && "shadow-[inset_0_0_0_1.5px_var(--primary)]",
                    day === d.date && "-translate-y-0.5 bg-foreground/15",
                    c?.done && "opacity-50",
                  )}
                >
                  <span className="num text-[10px]">{value}</span>
                  <i className="absolute inset-x-0 bottom-0 h-[4px]" style={{ background: c ? typeColor(c.type) : "transparent" }} />
                </span>
              </button>
            );
          })}
        </div>
      )}
      <Reveal open={!!picked}>
        <div className="px-3 pb-3">
          {session?.title ? (
            (() => {
              const ride = session.sport === "ride";
              const { big, unit } = bibNumber(session.title, session.km, ride ? { durationS: session.durationS } : undefined);
              return (
                <Bib
                  size="compact"
                  type={session.type}
                  label={`${tw(typeKey(session.type, session.sport))} · ${weekday(picked!.date)}`}
                  big={big}
                  unit={unit}
                  meta={
                    <>
                      {ride ? fmtMinutes(session.durationS) : `${session.km} km · ${t("about", { time: fmtMinutes(session.durationS) })}`}
                      {session.fromDate && <span className="block text-[12px] font-normal opacity-70">{t("was", { day: weekday(session.fromDate) })}</span>}
                    </>
                  }
                />
              );
            })()
          ) : (
            <p className="rounded-md bg-muted px-3 py-2.5 text-[13px] text-muted-foreground">{picked && !picked.after.length ? t("rest") : t("noBib")}</p>
          )}
        </div>
      </Reveal>
    </>
  );

  if (applied) {
    return (
      <div className="my-2 rounded-xl border border-border">
        <button type="button" onClick={() => setOpened(!open)} aria-expanded={open} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px]">
          <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-success text-background">
            <Check className="size-3" strokeWidth={3} />
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold">{option.title}</span>
          <span className="shrink-0 text-[12px] text-muted-foreground">{t("onWatch")}</span>
        </button>
        <Reveal open={open}>{body}</Reveal>
      </div>
    );
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border bg-card">
      <button type="button" onClick={() => setOpened(!open)} aria-expanded={open} className="flex w-full items-baseline justify-between gap-3 px-3 pb-1 pt-2.5 text-left">
        <span className="min-w-0 truncate text-[14px] font-semibold">{option.title}</span>
        <span className="num shrink-0 text-[11px] text-muted-foreground">
          {open ? (week ? weekLabel(week) : "") : t("show")}
        </span>
      </button>
      <Reveal open={open}>
        {option.summary && <p className="px-3 pb-1 text-[12px] text-muted-foreground">{option.summary}</p>}
        {week ? body : <ul className="px-3 pb-2">{option.lines.map((l, i) => <li key={i} className="num text-[13px]">{l}</li>)}</ul>}
        {otherWeeks > 0 && <p className="px-3 pb-2 text-[12px] text-muted-foreground">{t("moreWeeks", { n: otherWeeks })}</p>}
        {option.status === "invalid" ? (
          <p className="border-t border-border px-3 py-2.5 text-[13px] text-muted-foreground">{t("invalid", { reason: option.reason ?? "" })}</p>
        ) : (
          !readOnly && (
            <div className="border-t border-border px-3 py-2.5">
              <button type="button" disabled={busy} onClick={apply} className="h-9 w-full rounded-full bg-primary text-[13px] font-bold text-primary-foreground disabled:opacity-50">
                {t("use")}
              </button>
            </div>
          )
        )}
      </Reveal>
    </div>
  );
}
