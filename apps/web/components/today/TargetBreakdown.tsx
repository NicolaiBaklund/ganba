import { getTranslations } from "next-intl/server";
import type { DayActivityBreakdown } from "@/lib/db/activity";

/** How today's target is built (Garmin users): base + activity + planned run − goal. */
export async function TargetBreakdown({
  baseKcal,
  activity,
  goalKcal,
}: {
  baseKcal: number;
  activity: DayActivityBreakdown;
  goalKcal: number;
}) {
  const t = await getTranslations("today.breakdown");
  const done = activity.total - activity.plannedRunKcal;
  const parts: { label: string; value: number; tone?: string }[] = [
    { label: t("base"), value: baseKcal },
    { label: activity.source === "average" ? t("averaged") : t("activity"), value: done },
    ...(activity.plannedRunKcal > 0 ? [{ label: t("planned"), value: activity.plannedRunKcal, tone: "text-primary" }] : []),
    { label: t("goal"), value: goalKcal },
  ];
  const sign = (n: number, i: number) => (i === 0 ? `${n}` : n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
  return (
    <div className="-mt-1 flex flex-wrap gap-x-3 gap-y-1 px-2 text-xs text-muted-foreground">
      {parts.map((p, i) => (
        <span key={p.label}>
          {p.label} <span className={`num font-semibold ${p.tone ?? "text-foreground"}`}>{sign(Math.round(p.value), i)}</span>
        </span>
      ))}
    </div>
  );
}
