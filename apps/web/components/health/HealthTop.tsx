import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ISODate } from "@loop/core";
import type { HealthView } from "@/lib/health/view";
import { MorningNote } from "./MorningNote";
import { RaceClock } from "./RaceClock";

/** Top of Today: race clock, the coach's morning note (today only) and the stamp line. */
export async function HealthTop({ view, date, today }: { view: HealthView; date: ISODate; today: ISODate }) {
  const t = await getTranslations("health");
  const s = view.stampLine;
  const when = (d: ISODate) => (d === today ? t("onPlanToday") : t("onPlanDay", { day: new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }) }));
  return (
    <>
      {view.clock && <RaceClock clock={view.clock} today={date} href="/progress" />}
      {date === today && <MorningNote />}
      {s && date === today && (
        <Link href="/progress#stamps" className="mt-6 flex items-center gap-2.5">
          <span aria-hidden="true" className={`size-[26px] shrink-0 -rotate-6 rounded-md border-2 border-primary ${s.earned ? "bg-primary/15" : "border-dashed"}`} />
          <span className="text-[13px] text-muted-foreground">{s.earned ? s.label : `${s.label}: ${when(s.date)}`}</span>
        </Link>
      )}
    </>
  );
}
