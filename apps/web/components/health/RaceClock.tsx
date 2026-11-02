import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ISODate } from "@loop/core";
import type { HealthClock } from "@/lib/health/view";
import { fmtClock } from "@/lib/training/format";
import { CourseLine } from "./CourseLine";

/** The race clock (spec docs/specs/2026-11-02-health.md §4): predicted time, the change since yesterday, the road there. */
export async function RaceClock({ clock, today, href }: { clock: HealthClock; today: ISODate; href?: string }) {
  const t = await getTranslations("health");
  const d = clock.deltaS;
  const daysLeft = clock.race.date && clock.race.date > today ? Math.round((Date.parse(clock.race.date) - Date.parse(today)) / 86_400_000) : null;
  const body = (
    <>
      <p className="flex justify-between gap-3 text-[13px] text-muted-foreground">
        <span>{t(clock.finished ? "finished" : "ifToday", { race: clock.race.name })}</span>
        {daysLeft != null && <span>{t("daysLeft", { days: daysLeft })}</span>}
      </p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <span className="num text-[104px] font-black leading-[0.8] tracking-[-2px] [font-stretch:62%]">{clock.seconds ? fmtClock(clock.seconds) : "–"}</span>
        {d != null && d !== 0 && (
          <span className={`num pb-0.5 text-[22px] font-extrabold ${d < 0 ? "text-success" : "text-warning"}`}>
            {d < 0 ? "−" : "+"}
            {Math.abs(d)} s
          </span>
        )}
      </div>
      <CourseLine line={clock.line} today={today} raceDate={clock.race.date} tests={clock.tests} label={t("lineLabel", { race: clock.race.name })} />
      {clock.line.length >= 2 && (
        <div className="relative mt-1 h-4 text-[11px] text-muted-foreground">
          <span className="absolute left-0">{fmtClock(clock.line[0]!.seconds)}</span>
          {clock.race.date && clock.race.date > today && <span className="absolute right-0">{new Date(`${clock.race.date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</span>}
          {(!clock.race.date || clock.race.date <= today) && <span className="absolute right-0 font-bold text-primary">{t("now")}</span>}
        </div>
      )}
    </>
  );
  return href ? (
    <Link href={href} aria-label={t("open")} className="mt-6 block">
      {body}
    </Link>
  ) : (
    <section className="mt-6">{body}</section>
  );
}
