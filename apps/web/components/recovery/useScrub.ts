"use client";

import { useState } from "react";

/**
 * Drag (or hover) along a chart to pick the nearest day. Works from the pointer position itself, so it does not
 * depend on the chart library's tooltip state. `touch-action: pan-y` keeps vertical page scrolling.
 * `inset` = the chart's left/right margins, so the plot area lines up with the data.
 */
export function useScrub<T extends { x: number }>(data: readonly T[], inset = { left: 6, right: 6 }) {
  const [index, setIndex] = useState<number | null>(null);
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!data.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    const width = r.width - inset.left - inset.right;
    if (width <= 0) return;
    const f = Math.min(1, Math.max(0, (e.clientX - r.left - inset.left) / width));
    const lo = data[0]!.x;
    const target = lo + f * (data.at(-1)!.x - lo);
    let best = 0;
    for (let i = 1; i < data.length; i++) if (Math.abs(data[i]!.x - target) < Math.abs(data[best]!.x - target)) best = i;
    setIndex(best);
  };
  const safe = index != null && index < data.length ? index : null;
  return {
    selected: safe == null ? null : data[safe]!,
    bind: { onPointerDown: pick, onPointerMove: pick, style: { touchAction: "pan-y" } as const },
  };
}
