import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { SectionHead } from "@/components/tasuki/SectionHead";

/** Trend weight in one line: weekly change and goal date. The full chart lives on Body. */
export async function WeightRow({
  trendKg,
  weeklyChangeKg,
  goalKg,
  etaDate,
}: {
  trendKg: number | null;
  weeklyChangeKg: number | null;
  goalKg: number;
  etaDate: string | null;
}) {
  const t = await getTranslations("today");
  const format = await getFormatter();
  const change =
    weeklyChangeKg == null || weeklyChangeKg === 0
      ? t("weightSteady")
      : t(weeklyChangeKg < 0 ? "weightDown" : "weightUp", { kg: Math.abs(weeklyChangeKg).toFixed(1) });
  const eta = etaDate
    ? t("goalEta", { kg: goalKg, date: format.dateTime(new Date(`${etaDate}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" }) })
    : t("goalOnly", { kg: goalKg });
  return (
    <>
      <SectionHead title={t("weight")} />
      <Link href="/body" className="block border-b border-border py-3">
        <span className="num block text-[17px] font-extrabold">{trendKg?.toFixed(1) ?? "–"} kg</span>
        <span className="block text-[13px] text-muted-foreground">
          {change} {eta}
        </span>
      </Link>
    </>
  );
}
