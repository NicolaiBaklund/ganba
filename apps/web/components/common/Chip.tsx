"use client";

import { cn } from "@/lib/utils";

export function Chip({
  selected,
  disabled,
  onClick,
  children,
  className,
}: {
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-11 rounded-full border px-4 text-sm font-medium transition-colors",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-muted text-foreground hover:bg-muted/70",
        disabled && "opacity-35",
        className,
      )}
    >
      {children}
    </button>
  );
}
