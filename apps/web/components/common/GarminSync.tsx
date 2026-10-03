"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const PULL_PX = 80;

/**
 * Syncs Garmin when the app opens (the server skips it if synced < 15 min ago) and on
 * pull-to-refresh at the top of the page. Refreshes the page when new data arrived.
 */
export function GarminSync({ enabled }: { enabled: boolean }) {
  const t = useTranslations("garmin");
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);
  const busy = useRef(false);

  const syncRef = useRef(async (force: boolean) => {
    if (busy.current) return;
    busy.current = true;
    // Background sync on open stays invisible; only a pull shows progress.
    if (force) setSyncing(true);
    const res = await fetch("/api/garmin/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    busy.current = false;
    setSyncing(false);
    if (force || body?.status === "ok") router.refresh();
  });

  useEffect(() => {
    if (!enabled) return;
    void syncRef.current(false);

    const down = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 ? (e.touches[0]?.clientY ?? null) : null;
    };
    const move = (e: TouchEvent) => {
      if (start.current == null) return;
      const d = (e.touches[0]?.clientY ?? start.current) - start.current;
      pullRef.current = d > 0 ? Math.min(d * 0.5, PULL_PX * 1.3) : 0;
      setPull(pullRef.current);
    };
    const up = () => {
      if (start.current != null && pullRef.current >= PULL_PX) void syncRef.current(true);
      start.current = null;
      pullRef.current = 0;
      setPull(0);
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [enabled]);

  if (!enabled || (pull === 0 && !syncing)) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-50 flex justify-center"
      style={{ transform: `translateY(${syncing ? 12 : pull / 2}px)` }}
    >
      <span className="flex items-center gap-2 rounded-full bg-popover px-3 py-1.5 text-xs text-muted-foreground shadow-lg">
        <RefreshCw className={cn("size-3.5", syncing && "animate-spin text-primary")} style={syncing ? undefined : { transform: `rotate(${pull * 3}deg)` }} />
        {syncing ? t("syncing") : pull >= PULL_PX ? t("release") : t("pull")}
      </span>
    </div>
  );
}
