"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { mealTypeForHour } from "@/lib/dates";
import type { MealType } from "@/lib/db/today";

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * When the meal was eaten. Logging for today it shows the current time and keeps it fresh until the person
 * changes it; only a changed time is sent (`sent`), otherwise the entry gets the exact save moment.
 * Logging for a past day it starts empty (time unknown). The meal follows a changed time until picked by hand.
 */
export function useMealTime(opts: { backDated: boolean; onMeal: (m: MealType) => void }) {
  const [time, setTime] = useState("");
  const [touched, setTouched] = useState(false);
  const [mealPicked, setMealPicked] = useState(false);
  useEffect(() => {
    if (opts.backDated || touched) return;
    setTime(hhmm(new Date()));
    const id = setInterval(() => setTime(hhmm(new Date())), 30_000);
    return () => clearInterval(id);
  }, [opts.backDated, touched]);
  return {
    time,
    /** Only what the person set; undefined = "now". */
    sent: touched && time ? time : undefined,
    change: (v: string) => {
      setTime(v);
      setTouched(true);
      if (v && !mealPicked) opts.onMeal(mealTypeForHour(Number(v.slice(0, 2))));
    },
    pickedMeal: () => setMealPicked(true),
    reset: () => {
      setTouched(false);
      setMealPicked(false);
    },
  };
}

export function MealTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("food");
  return (
    <label className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm">
      <span className="font-semibold">{t("time")}</span>
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)} className="num rounded-md bg-muted px-3 py-1.5 text-base" aria-label={t("time")} />
    </label>
  );
}
