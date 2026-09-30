import { getTranslations } from "next-intl/server";
import type { Macros } from "@loop/core";

function Ring({ value, max }: { value: number; max: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const over = value > max;
  return (
    <svg viewBox="0 0 120 120" className="size-32 -rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--muted)" strokeWidth="10" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={over ? "var(--warning)" : "var(--primary)"}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
      />
    </svg>
  );
}

function MacroBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex-1">
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="num">
          {Math.round(value)}
          <span className="text-muted-foreground">/{max}g</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export async function KcalCard({
  intake,
  target,
  floored,
}: {
  intake: Macros;
  target: Macros;
  floored: boolean;
}) {
  const t = await getTranslations("today");
  const remaining = Math.round(target.kcal - intake.kcal);
  return (
    <section className="rounded-3xl bg-card p-5">
      <div className="flex items-center gap-5">
        <div className="relative">
          <Ring value={intake.kcal} max={target.kcal} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`num text-3xl font-bold ${remaining < 0 ? "text-warning" : ""}`}>{Math.abs(remaining)}</span>
            <span className="text-[11px] text-muted-foreground">{remaining < 0 ? t("over") : t("left")}</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 text-sm">
          <div>
            <p className="text-muted-foreground">{t("eaten")}</p>
            <p className="num text-xl font-semibold">{Math.round(intake.kcal)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("target")}</p>
            <p className="num text-xl font-semibold">{target.kcal}</p>
          </div>
        </div>
      </div>
      <div className="mt-5 flex gap-4">
        <MacroBar label={t("protein")} value={intake.proteinG} max={target.proteinG} color="var(--protein)" />
        <MacroBar label={t("carbs")} value={intake.carbsG} max={target.carbsG} color="var(--carbs)" />
        <MacroBar label={t("fat")} value={intake.fatG} max={target.fatG} color="var(--fat)" />
      </div>
      {floored && <p className="mt-4 text-xs text-warning">{t("floored")}</p>}
    </section>
  );
}
