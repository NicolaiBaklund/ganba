import type { WorkoutType } from "@loop/core";
import { cn } from "@/lib/utils";

/** Slanted tasuki stripe in a session type's colour. Solid = done, striped = planned, outline = missed. */
export function Sash({
  type,
  state = "done",
  className,
}: {
  type: WorkoutType | "rest" | "other";
  state?: "done" | "planned" | "missed";
  className?: string;
}) {
  const c = type === "other" ? "var(--foreground)" : `var(--w-${type})`;
  const style =
    state === "done"
      ? { background: c }
      : state === "planned"
        ? { background: `repeating-linear-gradient(90deg, ${c} 0 3px, transparent 3px 5px)` }
        : { boxShadow: "inset 0 0 0 1.5px var(--muted-foreground)" };
  return <span aria-hidden className={cn("block -skew-x-[20deg]", className)} style={style} />;
}
