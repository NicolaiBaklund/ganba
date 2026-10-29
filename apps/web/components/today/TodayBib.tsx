import { getFormatter, getTranslations } from "next-intl/server";
import { Check, UtensilsCrossed, Watch } from "lucide-react";
import { fuelingFor, type WorkoutType } from "@loop/core";
import { Bib, RestBib } from "@/components/tasuki/Bib";
import { bibNumber, fmtMinutes, typeKey } from "@/lib/training/format";
import type { WorkoutListItem } from "@/lib/training/view";

/** Today's session as a race bib, or a small rest-day bib that names the next session. */
export async function TodayBib({
  workout,
  kg,
  next,
  fuel: showFuel = true,
}: {
  workout: WorkoutListItem | null;
  kg: number;
  /** Training only has no food: no fueling line. */
  fuel?: boolean;
  next: { date: string; type: WorkoutType; title: string; plannedKm: number; plannedDurationS: number; sport: "run" | "ride" } | null;
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
        next={
          next
            ? {
                type: next.type,
                text:
                  next.sport === "ride"
                    ? t("nextTextRide", { day: weekday, type: t(typeKey(next.type, "ride")).toLowerCase(), time: fmtMinutes(next.plannedDurationS) })
                    : t("nextText", { day: weekday, type: t(`types.${next.type}`).toLowerCase(), km: next.plannedKm }),
              }
            : null
        }
      />
    );
  }

  const ride = workout.sport === "ride";
  const { big, unit } = bibNumber(workout.title, workout.plannedKm, ride ? { durationS: workout.plannedDurationS } : undefined);
  const done = workout.status === "done";
  const fuel = fuelingFor({ type: workout.type, plannedDurationS: workout.plannedDurationS }, kg, workout.sport);
  const fuelLine = fuel.before.carbsG
    ? tf("lineCarbs", { g: fuel.before.carbsG, p: fuel.after.proteinG })
    : tf("lineMeal", { p: fuel.after.proteinG });

  return (
    <Bib
      type={workout.type}
      label={t(typeKey(workout.type, workout.sport))}
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
          t(ride ? "bibMetaRide" : "bibMeta", { km: workout.plannedKm, time: fmtMinutes(workout.plannedDurationS) })
        )
      }
      footer={
        workout.status === "planned" && showFuel ? (
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
