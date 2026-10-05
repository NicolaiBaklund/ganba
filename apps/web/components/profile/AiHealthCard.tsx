"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Opt-in switch: sleep, HRV, food and training numbers may be sent to AI for recovery insights. */
export function AiHealthCard({ enabled }: { enabled: boolean }) {
  const t = useTranslations("aiHealth");
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setBusy(true);
    const res = await fetch("/api/settings/ai-health", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(t("error"));
    setOn(next);
    router.refresh();
  }

  return (
    <section id="ai" className="rounded-md bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="cond text-lg leading-none">{t("title")}</h2>
          </div>
          <p className="text-[13px] text-muted-foreground">{t("explain")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("title")}
          disabled={busy}
          onClick={toggle}
          className={cn("relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-muted")}
        >
          <span className={cn("absolute top-1 size-5 rounded-full bg-card shadow transition-[left]", on ? "left-6" : "left-1")} />
        </button>
      </div>
    </section>
  );
}
