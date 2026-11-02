import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { daysBetween, type ISODate } from "@loop/core";
import type { HealthClock } from "@/lib/health/view";
import { fmtClock } from "@/lib/training/format";
import { CourseLine } from "./CourseLine";

/** Top of Training: the race and its date, the predicted time, days left and the road there. Opens Progress. */
export async function RaceRoad({ clock, today }: { clock: HealthClock; today: ISODate }) {
  const t = await getTranslations("health");
  const date = clock.race.date;
  const ahead = date != null && date > today;
  const dateLabel = date ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : null;
  const head = clock.finished ? t("finished", { race: clock.race.name }) : dateLabel ? t("raceOn", { race: clock.race.name, date: dateLabel }) : t("ifToday", { race: clock.race.name });
  return (
    <Link href="/progress" className="mt-6 block">
      <p className="text-[13px] text-muted-foreground">{head}</p>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <span className="num text-[72px] font-black leading-[0.82] tracking-[-1px] [font-stretch:62%]">{clock.seconds ? fmtClock(clock.seconds) : "–"}</span>
        {ahead && <span className="pb-1 text-[13px] text-muted-foreground">{t("days", { days: daysBetween(today, date) })}</span>}
      </div>
      <CourseLine line={clock.line} today={today} raceDate={date} tests={[]} label={t("lineLabel", { race: clock.race.name })} compact />
    </Link>
  );
}
