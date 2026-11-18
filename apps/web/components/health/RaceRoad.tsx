import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { daysBetween, formatPace, type ISODate } from "@loop/core";
import type { HealthClock } from "@/lib/health/view";
import type { RacePaceAccount } from "@/lib/health/racePace";
import { fmtClock } from "@/lib/training/format";
import { CourseLine } from "./CourseLine";

/**
 * Top of Training: the race and its date, the predicted time, days left and the road there, and in race plans the
 * race pace run so far (spec 2026-11-18 §9). Opens Progress.
 */
export async function RaceRoad({ clock, today, racePace }: { clock: HealthClock; today: ISODate; racePace?: RacePaceAccount | null }) {
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
      {racePace && (
        <div className="mt-3">
          <p className="text-[13px]">
            {t("spot.racePace", { pace: formatPace(racePace.secPerKm) })} <span className="num text-muted-foreground">{t("spot.racePaceKm", { done: racePace.doneKm, planned: racePace.plannedKm })}</span>
          </p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={racePace.plannedKm} aria-valuenow={Math.min(racePace.doneKm, racePace.plannedKm)}>
            <div className="h-full" style={{ width: `${Math.min(100, (racePace.doneKm / racePace.plannedKm) * 100)}%`, background: "var(--w-race)" }} />
          </div>
        </div>
      )}
    </Link>
  );
}
