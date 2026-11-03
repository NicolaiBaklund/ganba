"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { addDays, type ISODate } from "@loop/core";
import type { ClockPoint, HealthClock } from "@/lib/health/view";
import { fmtClock } from "@/lib/training/format";
import { cn } from "@/lib/utils";
import { CourseLine, courseDateAt } from "./CourseLine";

const RANGES = [
  { key: "1m", days: 30 },
  { key: "3m", days: 91 },
  { key: "6m", days: 182 },
  { key: "1y", days: 365 },
] as const;
type Range = (typeof RANGES)[number]["key"];

const shortDate = (d: ISODate) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
/** −12 s, +1:05. */
const signed = (s: number) => `${s < 0 ? "−" : "+"}${Math.abs(s) < 60 ? `${Math.abs(s)} s` : fmtClock(Math.abs(s))}`;

/**
 * The race clock on Progress (spec docs/specs/2026-11-02-health.md §9): predicted time, the change since the start of
 * the chosen range (1M to 1Y), and the road there. Dragging along the line shows the time on that day.
 */
export function RaceClock({ clock, today }: { clock: HealthClock; today: ISODate }) {
  const t = useTranslations("health");
  const box = useRef<HTMLDivElement>(null);
  const first = clock.line[0]?.date ?? today;
  // A longer range only when the line reaches further back than the shorter one.
  const ranges = RANGES.filter((r, i) => i === 0 || first < addDays(today, -RANGES[i - 1]!.days));
  const [range, setRange] = useState<Range>(ranges.some((r) => r.key === "3m") ? "3m" : ranges.at(-1)!.key);
  const [cursor, setCursor] = useState<ClockPoint | null>(null);
  const [held, setHeld] = useState(false);

  const from = addDays(today, -RANGES.find((r) => r.key === range)!.days);
  const line = clock.line.filter((p) => p.date >= from);
  const seconds = cursor?.seconds ?? clock.seconds;
  const delta = line.length >= 2 && seconds != null ? seconds - line[0]!.seconds : null;
  const daysLeft = clock.race.date && clock.race.date > today ? Math.round((Date.parse(clock.race.date) - Date.parse(today)) / 86_400_000) : null;

  function scrub(e: React.PointerEvent) {
    if (line.length < 2 || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const d = courseDateAt(line, today, clock.race.date, (e.clientX - r.left) / r.width);
    // The nearest day with a prediction, never past today.
    const p = d <= line[0]!.date ? line[0]! : [...line].reverse().find((q) => q.date <= d)!;
    setCursor((c) => (c?.date === p.date ? c : p));
  }

  return (
    <section className="mt-6">
      <p className="flex justify-between gap-3 text-[13px] text-muted-foreground">
        <span>{cursor ? t("raceOn", { race: clock.race.name, date: shortDate(cursor.date) }) : t(clock.finished ? "finished" : "ifToday", { race: clock.race.name })}</span>
        {daysLeft != null && !cursor && <span>{t("daysLeft", { days: daysLeft })}</span>}
      </p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <span className="num text-[104px] font-black leading-[0.8] tracking-[-2px] [font-stretch:62%]">{seconds ? fmtClock(seconds) : "–"}</span>
      </div>
      {delta != null && delta !== 0 && (
        <p className={cn("num mt-3 text-[15px] font-extrabold", delta < 0 ? "text-success" : "text-warning")}>{t("sinceStart", { delta: signed(delta), date: shortDate(line[0]!.date) })}</p>
      )}
      <div
        ref={box}
        className="touch-pan-y select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setHeld(true);
          scrub(e);
        }}
        onPointerMove={(e) => (held || e.pointerType === "mouse") && scrub(e)}
        onPointerUp={() => (setHeld(false), setCursor(null))}
        onPointerCancel={() => (setHeld(false), setCursor(null))}
        onPointerLeave={() => !held && setCursor(null)}
      >
        <CourseLine line={line} today={today} raceDate={clock.race.date} tests={clock.tests} label={t("lineLabel", { race: clock.race.name })} cursor={cursor} />
      </div>
      {line.length >= 2 && (
        <div className="relative mt-1 h-4 text-[11px] text-muted-foreground">
          <span className="absolute left-0">{shortDate(line[0]!.date)}</span>
          {clock.race.date && clock.race.date > today ? (
            <span className="absolute right-0">{shortDate(clock.race.date)}</span>
          ) : (
            <span className="absolute right-0 font-bold text-primary">{t("now")}</span>
          )}
        </div>
      )}
      {ranges.length > 1 && (
        <div className="mt-4 flex gap-1.5" role="group" aria-label={t("rangeLabel")}>
          {ranges.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
              className={cn("h-9 rounded-full px-3.5 text-[13px] font-bold", range === r.key ? "bg-foreground text-background" : "text-muted-foreground")}
            >
              {t(`range.${r.key}`)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
