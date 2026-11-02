"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoCentroid, geoGraticule10, geoOrthographic, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";

const SIZE = 320;
/** Degrees per pixel of drag, and how quickly a flick slows down. */
const DRAG = 0.4;
const FRICTION = 0.94;

type Country = { id?: string | number } & GeoPermissibleObjects;
type Countries = { features: Country[] };
type Topology = Parameters<typeof feature>[0];

/**
 * A globe to spin by dragging, with the countries the person has run or ridden in filled in. Starts facing the
 * most recent one. Countries come from world-atlas (ISO numeric ids), loaded only when the globe is shown.
 */
export function Globe({ visited, label }: { visited: string[]; label: string }) {
  const [world, setWorld] = useState<Countries | null>(null);
  const [rot, setRot] = useState<[number, number]>([-20, -30]);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const spin = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    import("world-atlas/countries-110m.json").then((m) => {
      const topo = (m.default ?? m) as unknown as Topology;
      const w = feature(topo, topo.objects.countries as never) as unknown as Countries;
      if (!live) return;
      setWorld(w);
      // Face the first (latest) country, tilted a little so its hemisphere shows.
      const first = w.features.find((f) => String(f.id) === visited[0]);
      if (first) {
        const [lon, lat] = geoCentroid(first);
        setRot([-lon, -lat * 0.6]);
      }
    });
    return () => {
      live = false;
      if (spin.current) cancelAnimationFrame(spin.current);
    };
    // The globe is placed once, on load; later stamps don't turn it under the user's finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seen = useMemo(() => new Set(visited), [visited]);
  const projection = useMemo(() => geoOrthographic().scale(SIZE / 2 - 2).translate([SIZE / 2, SIZE / 2]).rotate([rot[0], rot[1], 0]).clipAngle(90), [rot]);
  const path = useMemo(() => geoPath(projection), [projection]);

  const clampLat = (y: number) => Math.max(-80, Math.min(80, y));
  function onDown(e: React.PointerEvent) {
    if (spin.current) cancelAnimationFrame(spin.current);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: 0, vy: 0 };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) * DRAG, dy = (e.clientY - d.y) * DRAG;
    drag.current = { x: e.clientX, y: e.clientY, vx: dx, vy: dy };
    setRot(([l, p]) => [l + dx, clampLat(p - dy)]);
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!d || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // A flick keeps turning and slows down.
    let { vx, vy } = d;
    const step = () => {
      vx *= FRICTION;
      vy *= FRICTION;
      if (Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05) return;
      setRot(([l, p]) => [l + vx, clampLat(p - vy)]);
      spin.current = requestAnimationFrame(step);
    };
    spin.current = requestAnimationFrame(step);
  }

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="mx-auto block w-full max-w-[320px] cursor-grab touch-none select-none active:cursor-grabbing"
      role="img"
      aria-label={label}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 2} className="fill-card stroke-border" strokeWidth={1} />
      <path d={path(geoGraticule10()) ?? ""} fill="none" className="stroke-border" strokeWidth={0.5} />
      {world?.features.map((f: Country, i: number) => (
        <path
          key={String(f.id ?? i)}
          d={path(f) ?? ""}
          className={seen.has(String(f.id)) ? "fill-primary stroke-background" : "fill-muted stroke-background"}
          strokeWidth={0.5}
        />
      ))}
    </svg>
  );
}
