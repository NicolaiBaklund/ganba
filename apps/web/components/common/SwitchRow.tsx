"use client";

import { cn } from "@/lib/utils";

/** A ruled row with a label, a hint and an on/off switch. */
export function SwitchRow({
  label,
  hint,
  on,
  onToggle,
  disabled,
  className,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 border-y border-border py-3", className)}>
      <span>
        <span className="block text-[15px] font-semibold">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-muted")}
      >
        <span className={cn("absolute top-1 size-5 rounded-full bg-card shadow transition-[left]", on ? "left-6" : "left-1")} />
      </button>
    </div>
  );
}
