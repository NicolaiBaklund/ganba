"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { flushQueue } from "@/lib/offline-queue";

/** Sends writes saved while offline, on load and when the connection returns. */
export function QueueFlusher() {
  const router = useRouter();
  useEffect(() => {
    const run = () =>
      flushQueue().then((sent) => {
        if (sent > 0) router.refresh();
      });
    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [router]);
  return null;
}
