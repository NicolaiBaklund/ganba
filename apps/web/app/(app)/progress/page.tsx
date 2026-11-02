import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import type { RaceDistance } from "@loop/core";
import { requireUser } from "@/lib/supabase/server";
import { loadClock, loadStampBook } from "@/lib/health/view";
import { loadRecoveryView } from "@/lib/recovery/view";
import { RECOVERY_HISTORY_DAYS } from "@/lib/recovery/fetch";
import { fmtClock } from "@/lib/training/format";
import { RaceClock } from "@/components/health/RaceClock";
import { StampBook } from "@/components/health/StampBook";
import { BodyCurves } from "@/components/health/BodyCurves";
import { Globe } from "@/components/health/Globe";
import { globeCountry } from "@/lib/health/country";

const DISTANCES: RaceDistance[] = ["5k", "10k", "half", "marathon"];

/** Progress (spec docs/specs/2026-11-02-health.md §9): the clock with all distances, the stamp book, the body. */
export default async function ProgressPage() {
  const { user } = await requireUser();
  const t = await getTranslations("health");
  const v = await loadRecoveryView(user.id);
  const [clock, stamps] = await Promise.all([loadClock(user.id, v.today), loadStampBook(user.id)]);
  // Newest first, so the globe opens facing the latest country.
  const countries = stamps.filter((s) => s.kind === "country" && s.earnedOn).flatMap((s) => globeCountry(s.key) ?? []);

  return (
    <main className="flex flex-col px-[18px] pb-8 pt-5">
      <Link href="/today" className="-ml-1 flex items-center gap-1 self-start text-sm text-muted-foreground">
        <ChevronLeft className="size-4" />
        {t("back")}
      </Link>
      <h1 className="cond mt-2 text-[34px] leading-none">{t("title")}</h1>
      {clock && (
        <>
          <RaceClock clock={clock} today={v.today} />
          <dl className="mt-6 grid grid-cols-4 gap-2 border-t border-border pt-4">
            {DISTANCES.map((d) => (
              <div key={d}>
                <dt className="text-[11px] text-muted-foreground">{t(`distance.${d}`)}</dt>
                <dd className="num text-[17px] font-extrabold">{clock.all[d] ? fmtClock(clock.all[d]!) : "–"}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {countries.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1.5">
            <h2 className="cond text-[22px] leading-none">{t("countries")}</h2>
            <span className="num text-[17px] font-extrabold">{countries.length}</span>
          </div>
          <div className="mt-5">
            <Globe visited={countries} label={t("globeLabel", { n: countries.length })} />
          </div>
          <p className="mt-2 text-center text-[13px] text-muted-foreground">{t("globeHint")}</p>
        </section>
      )}
      <StampBook stamps={stamps} />
      {v.garmin !== "none" && (
        <>
          {v.historyDays < RECOVERY_HISTORY_DAYS && <p className="mt-10 text-[13px] text-muted-foreground">{t("fetching", { days: v.historyDays })}</p>}
          <BodyCurves curves={v.curves} today={v.today} ai={v.consent} />
        </>
      )}
    </main>
  );
}
