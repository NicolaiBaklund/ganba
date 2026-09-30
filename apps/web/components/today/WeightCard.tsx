import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { TrendPoint } from "@loop/core";
import { MiniTrend } from "./MiniTrend";

export async function WeightCard({
  trendKg,
  weeklyChangeKg,
  goalKg,
  trend,
}: {
  trendKg: number | null;
  weeklyChangeKg: number | null;
  goalKg: number;
  trend: TrendPoint[];
}) {
  const t = await getTranslations("today");
  const Icon = weeklyChangeKg == null || weeklyChangeKg === 0 ? Minus : weeklyChangeKg < 0 ? TrendingDown : TrendingUp;
  return (
    <Link href="/body" className="block rounded-3xl bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{t("trendWeight")}</p>
          <p className="num mt-1 text-3xl font-bold">
            {trendKg?.toFixed(1) ?? "–"}
            <span className="ml-1 text-base font-medium text-muted-foreground">kg</span>
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="flex items-center justify-end gap-1 font-medium">
            <Icon className="size-4 text-primary" />
            <span className="num">
              {weeklyChangeKg == null ? "–" : `${weeklyChangeKg > 0 ? "+" : ""}${weeklyChangeKg.toFixed(1)}`}
            </span>
            <span className="text-muted-foreground">{t("perWeek")}</span>
          </p>
          <p className="mt-1 text-muted-foreground">
            {t("goal")} <span className="num">{goalKg}</span> kg
          </p>
        </div>
      </div>
      <MiniTrend trend={trend.slice(-30)} />
    </Link>
  );
}
