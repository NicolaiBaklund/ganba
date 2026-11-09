"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Sash } from "@/components/tasuki/Sash";
import { groupsLabel } from "@/lib/strength/format";
import type { StrengthItem } from "@/lib/strength/view";
import { cn } from "@/lib/utils";

/** A strength day in a week list, laid out like a session row: logged, from the watch, planned or missed. */
export function StrengthRow({ s, today }: { s: StrengthItem; today: string }) {
  const t = useTranslations("strength");
  const format = useFormatter();
  const sub = s.fromWatch ? t("fromWatch") : s.state === "missed" ? t("missed") : s.groups.length ? groupsLabel(s.groups, (g) => t(`groups.${g}`)) : null;
  const cls = cn("grid grid-cols-[42px_6px_1fr_auto] items-center gap-2.5 border-b border-border py-2.5 active:bg-muted/60", s.state === "missed" && "opacity-60");
  const body = (
    <>
      <span className="text-[11px] leading-tight text-muted-foreground">
        {format.dateTime(new Date(`${s.date}T00:00:00Z`), { weekday: "short", timeZone: "UTC" })}
        <b className={cn("num block text-lg font-extrabold", s.date === today ? "text-primary" : "text-foreground")}>{Number(s.date.slice(8))}</b>
      </span>
      <Sash type="strength" state={s.state === "planned" ? "done" : s.state} className="h-[30px] w-1.5" />
      <span className="min-w-0">
        <span className="block truncate font-bold">{t("title")}</span>
        {sub && <span className={cn("block truncate text-xs", s.state === "done" && !s.fromWatch ? "text-success" : "text-muted-foreground")}>{sub}</span>}
      </span>
      <span className="num font-extrabold">{s.minutes != null ? t("minutes", { min: s.minutes }) : ""}</span>
    </>
  );
  if (s.sessionId) return <Link href={`/training/strength/${s.sessionId}`} className={cls}>{body}</Link>;
  // Opening makes the day's session first (a route handler), so a plain link.
  if (s.activityId) return <a href={`/training/strength/open?activity=${s.activityId}`} className={cls}>{body}</a>;
  if (s.date <= today) return <a href={`/training/strength/open?date=${s.date}`} className={cls}>{body}</a>;
  return <div className={cls}>{body}</div>;
}
