"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Trainer season on/off for a cycling plan: the upcoming rides are rebuilt on the same dates. */
export function IndoorSwitch({ indoor }: { indoor: boolean }) {
  const t = useTranslations("training");
  const router = useRouter();
  const [on, setOn] = useState(indoor);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setBusy(true);
    setOn(next);
    const res = await fetch("/api/training/plan/indoor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ indoor: next }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setOn(!next);
      return toast.error(t("indoorError"));
    }
    router.refresh();
  }

  return (
    <div className="mt-5 flex items-center justify-between gap-4 border-y border-border py-3">
      <span>
        <span className="block text-[15px] font-semibold">{t("indoor")}</span>
        <span className="block text-xs text-muted-foreground">{t("indoorHint")}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t("indoor")}
        disabled={busy}
        onClick={toggle}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-muted")}
      >
        <span className={cn("absolute top-1 size-5 rounded-full bg-card shadow transition-[left]", on ? "left-6" : "left-1")} />
      </button>
    </div>
  );
}
