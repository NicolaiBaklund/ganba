"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import type { WeeklySummary as Summary } from "@loop/core";
import { SectionHead } from "@/components/tasuki/SectionHead";
import { cn } from "@/lib/utils";
import { aiErrorKey } from "./aiError";

export function WeeklySummary() {
  const t = useTranslations("recovery.ai");
  const [state, setState] = useState<{ summary: Summary } | { error: string } | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    fetch("/api/recovery/summary", { method: "POST" })
      .then(async (r) => ((await r.json().catch(() => ({ error: "unavailable" }))) as { summary: Summary } | { error: string }))
      .then(setState)
      .catch(() => setState({ error: "unavailable" }));
    // Monthly AI questions: fire and forget; the server decides whether it is due.
    fetch("/api/recovery/questions", { method: "POST" }).catch(() => null);
  }, []);

  if (!state) return <div className="mt-6 h-24 animate-pulse rounded-md bg-muted" role="status" aria-label={t("loading")} />;
  if ("error" in state) {
    if (state.error === "not_enough_data") return null;
    return <p className="mt-6 text-[13px] text-muted-foreground">{t(aiErrorKey(state.error))}</p>;
  }
  const s = state.summary;
  if (!s.sentences.length && !s.tips.length) return null;
  return (
    <section>
      <SectionHead
        title={t("summary")}
        action={
          <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={t("summary")}>
            <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
          </button>
        }
      />
      {open && (
        <div className="pt-2">
          {s.headline && <p className="cond text-xl leading-tight">{s.headline}</p>}
          {s.sentences.map((x, i) => (
            <p key={i} className="mt-1.5 text-[15px]">{x.text}</p>
          ))}
          {!!s.tips.length && (
            <>
              <p className="mt-3 text-[13px] font-bold">{t("tips")}</p>
              {s.tips.map((x, i) => (
                <p key={i} className="mt-1 text-[15px]">{x.text}</p>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
