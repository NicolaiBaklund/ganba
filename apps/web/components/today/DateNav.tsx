import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { addDays } from "@loop/core";

export async function DateNav({ date, today, basePath, profileLink = false }: { date: string; today: string; basePath: string; profileLink?: boolean }) {
  const t = await getTranslations("today");
  const format = await getFormatter();
  const label =
    date === today
      ? t("todayLabel")
      : date === addDays(today, -1)
        ? t("yesterday")
        : format.dateTime(new Date(`${date}T00:00:00Z`), { weekday: "short", day: "numeric", month: "short" });
  const next = addDays(date, 1);
  return (
    <header className="flex items-center justify-between px-1 pb-2 pt-4">
      <Link href={`${basePath}?date=${addDays(date, -1)}`} className="p-2 text-muted-foreground" aria-label={t("prevDay")}>
        <ChevronLeft className="size-5" />
      </Link>
      <h1 className="font-heading text-2xl font-bold">{label}</h1>
      {date < today ? (
        <Link href={next === today ? basePath : `${basePath}?date=${next}`} className="p-2 text-muted-foreground" aria-label={t("nextDay")}>
          <ChevronRight className="size-5" />
        </Link>
      ) : (
        <span className="size-9" />
      )}
      {profileLink && (
        <Link href="/profile" className="ml-1 flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-label={t("profile")}>
          <UserRound className="size-5" />
        </Link>
      )}
    </header>
  );
}
