"use client";

import { useTranslations } from "next-intl";
import { changedWeek, type PreviewCell, type PreviewWeek } from "@loop/core";
import { typeColor } from "@/lib/training/format";
import { cn } from "@/lib/utils";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

function Cell({ cells, changed, faded }: { cells: PreviewCell[]; changed?: boolean; faded?: boolean }) {
  const c = cells[0];
  // Rides are about time (minutes), runs about km; a day's first session decides.
  const ride = c?.sport === "ride";
  const size = cells.filter((x) => (x.sport === "ride") === ride).reduce((s, x) => s + (ride ? x.min : x.km), 0);
  return (
    <div
      className={cn(
        "relative flex h-[30px] flex-col justify-end overflow-hidden rounded bg-muted",
        faded && "opacity-45",
        c?.done && "opacity-35",
        changed && "outline outline-2 -outline-offset-2 outline-primary",
      )}
    >
      {c && <span className="num pb-0.5 text-center text-[10px] font-bold">{ride ? `${size}′` : size.toLocaleString("en", { maximumFractionDigits: 1 })}</span>}
      <i className="block h-[5px]" style={{ background: c ? typeColor(c.type) : "var(--w-rest)" }} />
    </div>
  );
}

/** The week an option changes: "Now" over "New", one column per day, changed days outlined. */
export function WeekPreview({ weeks }: { weeks: PreviewWeek[] }) {
  const t = useTranslations("coach");
  const wk = changedWeek(weeks);
  if (!wk) return null;
  return (
    <div className="mt-2.5">
      <div className="grid grid-cols-[30px_repeat(7,1fr)] items-center gap-1 text-[10px] text-muted-foreground">
        <span />
        {DAYS.map((d, i) => (
          <span key={i} className="text-center">{d}</span>
        ))}
        <span>{t("now")}</span>
        {wk.days.map((d) => (
          <Cell key={`b${d.date}`} cells={d.before} faded />
        ))}
        <span className="text-foreground">{t("newRow")}</span>
        {wk.days.map((d) => (
          <Cell key={`a${d.date}`} cells={d.after} changed={d.changed} />
        ))}
      </div>
      {weeks.length > 1 && <p className="mt-1 text-[12px] text-muted-foreground">{t("moreWeeks", { n: weeks.length - 1 })}</p>}
    </div>
  );
}
