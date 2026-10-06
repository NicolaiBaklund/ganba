"use client";

import { useRef, useState } from "react";

const TAP_SLOP = 8; // px a finger may wander and still count as a tap

/**
 * Tap a chart to get the nearest day (`onTap`), or press and drag sideways to read days one by one.
 * Works from the pointer position itself, not the chart library's tooltip state. Hover and vertical scrolling
 * (`touch-action: pan-y` hands those to the browser, which cancels the pointer) never select anything.
 * The pick is kept as an x value, so new data cannot shift it to another day. `inset` = the chart's side margins.
 */
export function useScrub<T extends { x: number }>(data: readonly T[], onTap: (d: T) => void, inset = { left: 6, right: 6 }) {
  const [x, setX] = useState<number | null>(null);
  const press = useRef<{ x0: number; y0: number; dragging: boolean } | null>(null);

  const nearest = (e: React.PointerEvent<HTMLDivElement>): T | null => {
    if (!data.length) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const width = r.width - inset.left - inset.right;
    if (width <= 0) return null;
    const f = Math.min(1, Math.max(0, (e.clientX - r.left - inset.left) / width));
    const lo = data[0]!.x;
    const target = lo + f * (data.at(-1)!.x - lo);
    let best = data[0]!;
    for (const d of data) if (Math.abs(d.x - target) < Math.abs(best.x - target)) best = d;
    return best;
  };

  const bind = {
    style: { touchAction: "pan-y" } as const,
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      press.current = { x0: e.clientX, y0: e.clientY, dragging: false };
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const p = press.current;
      if (!p) return; // hover: nothing
      if (!p.dragging && Math.abs(e.clientX - p.x0) > TAP_SLOP && Math.abs(e.clientX - p.x0) > Math.abs(e.clientY - p.y0)) {
        p.dragging = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      if (p.dragging) setX(nearest(e)?.x ?? null);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const p = press.current;
      press.current = null;
      if (!p || p.dragging) return; // a drag only reads; "Open day" opens
      const d = nearest(e);
      if (d) {
        setX(d.x);
        onTap(d);
      }
    },
    onPointerCancel: () => {
      press.current = null; // the browser took over (vertical scroll)
    },
  };

  return { selected: x == null ? null : (data.find((d) => d.x === x) ?? null), bind };
}
