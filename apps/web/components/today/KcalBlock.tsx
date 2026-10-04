import { getTranslations } from "next-intl/server";
import type { Macros } from "@loop/core";
import { TargetSheet } from "./TargetSheet";

function MacroBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="min-w-0">
      <p className="num text-[15px] font-extrabold">
        {Math.round(value)}/{max} g
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
      <span className="mt-1.5 block h-1.5 bg-border">
        <span className="block h-full" style={{ width: `${pct}%`, background: color }} />
      </span>
    </div>
  );
}

export async function KcalBlock({
  intake,
  target,
  floored,
  activityKcal,
  breakdown,
}: {
  intake: Macros;
  target: Macros;
  floored: boolean;
  activityKcal: number | null;
  breakdown: { base: number; activity: number; goal: number } | null;
}) {
  const t = await getTranslations("today");
  const remaining = Math.round(target.kcal - intake.kcal);
  const side = (
    <span className="block text-right text-[13px] leading-normal text-muted-foreground">
      <b className="num text-base font-extrabold text-foreground">{Math.round(intake.kcal)}</b> {t("eaten").toLowerCase()}
      <br />
      <b className="num text-base font-extrabold text-foreground">{target.kcal}</b> {t("target").toLowerCase()}
      {activityKcal != null && activityKcal > 0 && (
        <>
          <br />
          <span className="num mt-0.5 inline-block -skew-x-12 bg-primary px-[7px] py-px text-[13px] font-extrabold text-primary-foreground">
            {t("activityTag", { kcal: Math.round(activityKcal) })}
          </span>
        </>
      )}
    </span>
  );
  return (
    <section className="mt-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className={`num text-[72px] font-black leading-[.9] [font-stretch:62%] ${remaining < 0 ? "text-warning" : ""}`}>{Math.abs(remaining)}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{remaining < 0 ? t("overToday") : t("leftToday")}</p>
        </div>
        {breakdown ? <TargetSheet target={target.kcal} breakdown={breakdown}>{side}</TargetSheet> : side}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3.5">
        <MacroBar label={t("protein")} value={intake.proteinG} max={target.proteinG} color="var(--protein)" />
        <MacroBar label={t("carbs")} value={intake.carbsG} max={target.carbsG} color="var(--carbs)" />
        <MacroBar label={t("fat")} value={intake.fatG} max={target.fatG} color="var(--fat)" />
      </div>
      {floored && <p className="mt-3 text-xs text-warning">{t("floored")}</p>}
    </section>
  );
}
