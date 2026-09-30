"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/** Accepts both "82.5" and "82,5". Returns null for empty/invalid input. */
export const parseNum = (s: string): number | null => {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() === "" || Number.isNaN(n) ? null : n;
};

export function NumberField({
  label,
  unit,
  value,
  onChange,
  decimal = true,
  hint,
  className,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  decimal?: boolean;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <div className="flex h-14 items-center rounded-xl border border-border bg-muted px-4 focus-within:border-primary">
        <input
          id={id}
          inputMode={decimal ? "decimal" : "numeric"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="num w-full bg-transparent text-2xl font-semibold outline-none"
        />
        {unit && <span className="text-muted-foreground">{unit}</span>}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
