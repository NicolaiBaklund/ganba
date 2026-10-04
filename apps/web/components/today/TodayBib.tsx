import { getFormatter, getTranslations } from "next-intl/server";
import { Check, UtensilsCrossed, Watch } from "lucide-react";
import { fuelingFor, type WorkoutType } from "@loop/core";
import { Bib, RestBib } from "@/components/tasuki/Bib";
import { bibNumber, fmtMinutes } from "@/lib/training/format";
import type { WorkoutListItem } from "@/lib/training/view";

/** Today's session as a race bib, or a small rest-day bib that names the next session. */
export async function TodayBib({
  workout,
  kg,
  next,
}: {
  workout: WorkoutListItem | null;
  kg: number;
  next: { date: string; type: WorkoutType; title: string; plannedKm: number } | null;
}) {
  const t = await getTranslations("workout");
  const tf = await getTranslations("fuel");
  const format = await getFormatter();

  if (!workout) {
    const weekday = next ? format.dateTime(new Date(`${next.date}T00:00:00Z`), { weekday: "long", timeZone: "UTC" }) : "";
    return (
      <RestBib
        title={t("rest")}
        nextLabel={t("next")}
        next={next ? { type: next.type, text: t("nextText", { day: weekday, type: t(`types.${next.type}`).toLowerCase(), km: next.plannedKm }) } : null}
      />
    );
  }

  const { big, unit } = bibNumber(workout.title, workout.plannedKm);
  const done = workout.status === "done";
  const fuel = fuelingFor({ type: workout.type, plannedDurationS: workout.plannedDurationS }, kg);
  const fuelLine = fuel.before.carbsG
    ? tf("lineCarbs", { g: fuel.before.carbsG, p: fuel.after.proteinG })
    : tf("lineMeal", { p: fuel.after.proteinG });

  return (
    <Bib
      type={workout.type}
      label={t(`types.${workout.type}`)}
      big={big}
      unit={unit}
      href={`/training/workout/${workout.id}`}
      meta={
        done && workout.actualKm != null ? (
          <span className="inline-flex items-center gap-1 text-paper-success">
            <Check className="size-4" />
            {t("doneKm", { km: workout.actualKm })}
          </span>
        ) : (
          t("bibMeta", { km: workout.plannedKm, time: fmtMinutes(workout.plannedDurationS) })
        )
      }
      footer={
        workout.status === "planned" ? (
          <>
            <UtensilsCrossed className="size-4 shrink-0" />
            <span className="num min-w-0 flex-1 truncate">{fuelLine}</span>
            {workout.push === "pushed" && <Watch className="size-4 shrink-0 text-paper-ink/60" aria-label={t("onWatch")} />}
          </>
        ) : undefined
      }
    />
  );
}
