"use client";

import { useTranslations } from "next-intl";
import { Chip } from "@/components/common/Chip";

/** Monday first; 0 = Sunday … 6 = Saturday. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** Seven weekday chips. `blocked` days can't be picked (e.g. the main sport's days when picking cross days). */
export function DayPicker({ selected, onToggle, blocked = [], disabled }: { selected: number[]; onToggle: (d: number) => void; blocked?: number[]; disabled?: boolean }) {
  const tw = useTranslations("weekdays");
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {WEEK.map((d) => (
        <Chip key={d} selected={selected.includes(d)} disabled={disabled || blocked.includes(d)} onClick={() => onToggle(d)} className="h-11 px-0 text-xs">
          {tw(String(d))}
        </Chip>
      ))}
    </div>
  );
}
