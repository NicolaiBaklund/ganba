import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { addDays, mondayOf } from "@loop/core";
import { Sash } from "@/components/tasuki/Sash";
import type { WeekDay } from "@/lib/db/week";
import { cn } from "@/lib/utils";

/** Date line + Mon–Sun strip. White box = food logged, red = selected day, stripes = sessions. */
export async function WeekStrip({
  days,
  date,
  today,
  basePath,
  profileLink = false,
}: {
  days: WeekDay[];
  date: string;
  today: string;
  basePath: string;
  profileLink?: boolean;
}) {
  const t = await getTranslations("today");
  const format = await getFormatter();
  const href = (d: string) => (d === today ? basePath : `${basePath}?date=${d}`);
  const prevWeek = addDays(mondayOf(date), -7);
  const nextMonday = addDays(mondayOf(date), 7);
  const canNext = nextMonday <= today;
  const label = format.dateTime(new Date(`${date}T00:00:00Z`), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return (
    <header className="pt-4">
      <div className="flex items-center gap-1">
        <Link href={href(prevWeek)} className="-ml-2 p-2 text-muted-foreground" aria-label={t("prevWeek")}>
          <ChevronLeft className="size-4" />
        </Link>
        <h1 className="cond text-[15px] [font-stretch:75%]">{label}</h1>
        {canNext && (
          <Link href={href(nextMonday)} className="p-2 text-muted-foreground" aria-label={t("nextWeek")}>
            <ChevronRight className="size-4" />
          </Link>
        )}
        {date !== today && (
          <Link href={basePath} className="ml-1 text-[13px] font-semibold text-primary">
            {t("backToToday")}
          </Link>
        )}
        {profileLink && (
          <Link href="/profile" className="ml-auto grid size-[34px] place-items-center rounded-full border border-border bg-card" aria-label={t("profile")}>
            <UserRound className="size-4" />
          </Link>
        )}
      </div>
      <ol className="mt-3 grid grid-cols-7 gap-1 text-center" aria-label={t("weekStrip")}>
        {days.map((d) => {
          const future = d.date > today;
          const selected = d.date === date;
          const box = (
            <>
              <span className="text-[11px] text-muted-foreground">
                {format.dateTime(new Date(`${d.date}T00:00:00Z`), { weekday: "narrow", timeZone: "UTC" })}
              </span>
              <b
                className={cn(
                  "num mt-[3px] grid h-[34px] place-items-center rounded-md text-[15px] font-bold",
                  selected ? "bg-primary text-primary-foreground" : d.logged && "bg-card",
                )}
              >
                {Number(d.date.slice(8))}
              </b>
              <span className="mx-1 mt-[5px] flex h-1.5 gap-0.5">
                {d.sessions.map((s, i) => (
                  <Sash key={i} type={s.type} state={s.state} className="h-full flex-1" />
                ))}
              </span>
            </>
          );
          return <li key={d.date}>{future ? <span className="block">{box}</span> : <Link href={href(d.date)} className="block">{box}</Link>}</li>;
        })}
      </ol>
    </header>
  );
}
