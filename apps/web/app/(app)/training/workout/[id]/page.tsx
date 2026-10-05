import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronLeft, Watch } from "lucide-react";
import { formatPace, fuelingFor, type Block, type Step, type WorkoutType } from "@loop/core";
import { requireUser } from "@/lib/supabase/server";
import { loadWorkout } from "@/lib/training/view";
import { bibNumber, fmtClock, fmtMinutes, fmtPaceRange, paceFromSpeed } from "@/lib/training/format";
import { FuelSection } from "@/components/training/FuelSection";
import { CoachButton } from "@/components/coach/CoachButton";
import { Bib } from "@/components/tasuki/Bib";
import { SectionHead } from "@/components/tasuki/SectionHead";
import { StatRow } from "@/components/tasuki/StatRow";

const amountOf = (s: Step, open: string) =>
  s.duration.kind === "distance"
    ? s.duration.m >= 1000
      ? `${Math.round(s.duration.m / 100) / 10} km`
      : `${s.duration.m} m`
    : s.duration.kind === "time"
      ? s.duration.s >= 60
        ? `${Math.round((s.duration.s / 60) * 10) / 10} min`
        : `${s.duration.s} s`
      : open;

/** Rough metres for the step stripe: time steps count at about 5 min/km. */
const weightOf = (s: Step) => (s.duration.kind === "distance" ? s.duration.m : s.duration.kind === "time" ? s.duration.s * 3.3 : 500);

function StepStripe({ blocks, type }: { blocks: Block[]; type: WorkoutType }) {
  const steps = blocks.flatMap((b) => (b.kind === "repeat" ? Array.from({ length: b.times }, () => b.steps).flat() : [b]));
  const color = (s: Step) => (s.kind === "recover" ? "var(--border)" : s.kind === "run" ? `var(--w-${type})` : "var(--w-easy)");
  return (
    <div aria-hidden className="mt-3 flex h-2.5 gap-[3px]">
      {steps.map((s, i) => (
        <span key={i} className="block h-full" style={{ flex: weightOf(s), background: color(s) }} />
      ))}
    </div>
  );
}

function StepRow({ s, label, open }: { s: Step; label: string; open: string }) {
  const pace = fmtPaceRange(s.target);
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2.5">
      <span className={s.kind === "recover" ? "text-muted-foreground" : "font-bold"}>
        {label} <span className="num">{amountOf(s, open)}</span>
      </span>
      {pace && <span className="num text-muted-foreground">{pace}</span>}
    </div>
  );
}

export default async function WorkoutPage({ params }: PageProps<"/training/workout/[id]">) {
  const { id } = await params;
  const t = await getTranslations("workout");
  const format = await getFormatter();
  const { user } = await requireUser();
  const w = await loadWorkout(user.id, id);
  if (!w) notFound();

  const a = w.activity;
  const pace = a && a.distanceKm > 0 ? formatPace((a.movingS ?? a.durationS) / a.distanceKm) : null;
  const { big, unit } = bibNumber(w.title, w.plannedKm);
  const date = format.dateTime(new Date(`${w.date}T00:00:00Z`), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const status = w.status === "removed" ? null : t(w.status);
  const watch = w.push === "pushed" ? t("onWatch") : w.push === "failed" ? t("pushFailed") : t("notOnWatch");

  return (
    <main className="flex flex-col px-[18px] pb-4 pt-4">
      <Link href="/training" className="-ml-1 mb-3 flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="size-4" />
        {t("back")}
      </Link>

      <Bib
        type={w.type}
        label={t(`types.${w.type}`)}
        big={big}
        unit={unit}
        meta={
          <>
            {date}
            {status && <span className="font-normal text-paper-ink/60">, {status.toLowerCase()}</span>}
          </>
        }
        footer={
          w.status === "planned" ? (
            <>
              <Watch className="size-4 shrink-0" />
              <span>{watch}</span>
              <span className="num ml-auto font-bold">
                {w.plannedKm} km, {fmtMinutes(w.plannedDurationS)}
              </span>
            </>
          ) : undefined
        }
      />

      {a && (
        <div className="mt-5">
          <StatRow
            items={[
              { value: `${a.distanceKm} km`, label: t("actualKm") },
              { value: `${pace ?? "–"} /km`, label: t("pace") },
              { value: a.avgHr ?? "–", label: t("hr") },
              { value: fmtClock(a.movingS ?? a.durationS), label: t("duration") },
            ]}
          />
        </div>
      )}

      <SectionHead title={t("steps")} />
      <StepStripe blocks={w.blocks} type={w.type} />
      <div className="mt-1">
        {w.blocks.map((b, i) =>
          b.kind === "repeat" ? (
            <div key={i} className="mt-2">
              <p className="num pt-1 font-extrabold text-primary">{t("repeat", { times: b.times })}</p>
              <div className="border-l-2 border-foreground pl-3">
                {b.steps.map((s, j) => (
                  <StepRow key={j} s={s} label={t(`step.${s.kind}`)} open={t("open")} />
                ))}
              </div>
            </div>
          ) : (
            <StepRow key={i} s={b} label={t(`step.${b.kind}`)} open={t("open")} />
          ),
        )}
      </div>

      {w.status !== "removed" && (
        <FuelSection
          workoutId={w.id}
          fueling={fuelingFor({ type: w.type, plannedDurationS: w.plannedDurationS }, w.kg)}
          initialAdvice={w.fuelAdvice}
          canSuggest={w.upcoming}
        />
      )}

      {a && a.laps.length > 1 && (
        <>
          <SectionHead title={t("laps")} />
          <div>
            {a.laps.map((l, i) => {
              const lp = paceFromSpeed(l.avgSpeed);
              return (
                <div key={i} className="num grid grid-cols-4 border-b border-border py-2">
                  <span className="text-muted-foreground">{i + 1}</span>
                  <span>{Math.round(l.distanceM / 10) / 100} km</span>
                  <span className="font-bold">{lp ? formatPace(lp) : "–"}</span>
                  <span className="text-right text-muted-foreground">{l.avgHr ? Math.round(l.avgHr) : "–"}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
      {w.status === "planned" && (
        <div className="mt-6">
          <CoachButton aboutWorkoutId={w.id} variant="link" />
        </div>
      )}
    </main>
  );
}
