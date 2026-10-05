"use client";

import { useTranslations } from "next-intl";
import type { CurvePoint, ISODate } from "@loop/core";
import { cn } from "@/lib/utils";

type Key = "sleepScore" | "hrv" | "restingHr";
const KEYS: Key[] = ["sleepScore", "hrv", "restingHr"];

/** Last night's three numbers, coloured against the person's normal band. Tap → the day sheet. */
export function TonightRow({ curves, today, onPick }: { curves: Record<Key, CurvePoint[]>; today: ISODate; onPick: (d: ISODate) => void }) {
  const t = useTranslations("recovery");
  const points = KEYS.map((k) => ({ k, p: curves[k].at(-1)?.date === today ? curves[k].at(-1)! : null }));
  if (points.every((x) => !x.p)) return null;
  const tone = (k: Key, p: CurvePoint) => {
    if (p.low == null || p.high == null) return "";
    const good = k === "restingHr" ? p.value < p.low : p.value > p.high;
    const bad = k === "restingHr" ? p.value > p.high : p.value < p.low;
    return good ? "text-success" : bad ? "text-primary" : "";
  };
  const arrow = (p: CurvePoint) => (p.high != null && p.value > p.high ? " ↑" : p.low != null && p.value < p.low ? " ↓" : "");
  return (
    <button
      type="button"
      onClick={() => onPick(today)}
      aria-label={t("form.tonight")}
      className="mt-5 grid w-full grid-cols-3 border-y border-border py-3 text-center"
    >
      {points.map(({ k, p }) => (
        <span key={k} className="flex flex-col">
          <span className={cn("num text-[22px] font-extrabold leading-none", p && tone(k, p))}>
            {p ? `${Math.round(p.value)}${arrow(p)}` : "–"}
          </span>
          <span className="mt-1 text-[12px] text-muted-foreground">{t(`metric.${k}`)}</span>
        </span>
      ))}
    </button>
  );
}
