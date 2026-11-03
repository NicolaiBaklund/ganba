import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { addDays, type ISODate, type TrendPoint } from "@loop/core";

const W = 72;
const H = 24;

/** Trend weight, weekly change and goal date in one row, with the last 4 weeks as a small line. Opens Body. */
export async function WeightRow({
  trendKg,
  weeklyChangeKg,
  goalKg,
  etaDate,
  trend,
  date,
}: {
  trendKg: number | null;
  weeklyChangeKg: number | null;
  goalKg: number;
  etaDate: string | null;
  trend: TrendPoint[];
  date: ISODate;
}) {
  const t = await getTranslations("today");
  const format = await getFormatter();
  const change =
    weeklyChangeKg == null || Math.abs(weeklyChangeKg) < 0.05
      ? t("weightSteady")
      : t("weightPerWeek", { kg: `${weeklyChangeKg < 0 ? "−" : "+"}${Math.abs(weeklyChangeKg).toFixed(1)}` });
  const goal = etaDate
    ? t("weightGoalEta", { date: format.dateTime(new Date(`${etaDate}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" }) })
    : t("weightGoalOnly", { kg: goalKg });
  const recent = trend.filter((p) => p.date > addDays(date, -28) && p.date <= date);
  const kgs = recent.map((p) => p.trendKg);
  const lo = Math.min(...kgs), hi = Math.max(...kgs);
  const pts = recent.map((p, i) => [(i / Math.max(1, recent.length - 1)) * (W - 4) + 2, hi === lo ? H / 2 : 2 + ((hi - p.trendKg) / (hi - lo)) * (H - 4)] as const);

  return (
    <Link href="/body" className="mt-6 flex items-center justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="num block text-[17px] font-extrabold">{trendKg?.toFixed(1) ?? "–"} kg</span>
        <span className="block truncate text-[13px] text-muted-foreground">
          {change}, {goal}
        </span>
      </span>
      {pts.length >= 3 && (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="shrink-0 overflow-visible" aria-hidden="true">
          <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r={2.5} className="fill-foreground" />
        </svg>
      )}
    </Link>
  );
}
