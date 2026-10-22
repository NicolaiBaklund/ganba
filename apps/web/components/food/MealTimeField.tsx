"use client";

import { useTranslations } from "next-intl";

/** "19:30" now in the device's clock (logging happens on the phone, in the person's own time). */
export const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** When the meal was eaten, set while logging. Empty = unknown (only for back-dated meals). */
export function MealTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("food");
  return (
    <label className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm">
      <span className="font-semibold">{t("time")}</span>
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)} className="num rounded-md bg-muted px-3 py-1.5 text-base" aria-label={t("time")} />
    </label>
  );
}
