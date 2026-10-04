"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { SectionHead } from "@/components/tasuki/SectionHead";
import { toast } from "sonner";
import type { FuelAdvice, Fueling } from "@loop/core";

const KNOWN = ["no_key", "invalid_key", "unavailable", "refused", "invalid_output"];

/** Before / during / after targets (rules) plus an unobtrusive link for AI food ideas. */
export function FuelSection({
  workoutId,
  fueling,
  initialAdvice,
  canSuggest,
}: {
  workoutId: string;
  fueling: Fueling;
  initialAdvice: FuelAdvice | null;
  canSuggest: boolean;
}) {
  const t = useTranslations("fuel");
  const te = useTranslations("training.errors");
  const [advice, setAdvice] = useState(initialAdvice);
  const [busy, setBusy] = useState(false);

  async function suggest() {
    setBusy(true);
    const res = await fetch(`/api/training/workout/${workoutId}/fuel`, { method: "POST" }).catch(() => null);
    setBusy(false);
    const body = await res?.json().catch(() => null);
    if (!res?.ok || !body?.advice) return toast.error(te(KNOWN.includes(body?.error) ? body.error : "generic"));
    setAdvice(body.advice);
  }

  const b = fueling.before;
  const rows: { key: "before" | "during" | "after"; text: string; ideas: string[] }[] = [
    {
      key: "before",
      text: b.carbsG ? t("carbs", { g: b.carbsG, from: b.hoursBefore[0], to: b.hoursBefore[1] }) : t("meal", { from: b.hoursBefore[0], to: b.hoursBefore[1] }),
      ideas: advice?.before ?? [],
    },
    ...(fueling.during
      ? [
          {
            key: "during" as const,
            text: t("duringPlan", {
              lo: fueling.during.carbsPerHour[0],
              hi: fueling.during.carbsPerHour[1],
              flo: fueling.during.fluidMlPerHour[0] / 100,
              fhi: fueling.during.fluidMlPerHour[1] / 100,
            }),
            ideas: advice?.during ?? [],
          },
        ]
      : []),
    {
      key: "after",
      text: fueling.after.carbsG ? t("afterBoth", { p: fueling.after.proteinG, c: fueling.after.carbsG }) : t("afterProtein", { p: fueling.after.proteinG }),
      ideas: advice?.after ?? [],
    },
  ];

  return (
    <section>
      <SectionHead title={t("title")} />
      <div>
        {rows.map((r) => (
          <div key={r.key} className="border-b border-border py-2.5">
            <p className="font-bold">{t(r.key)}</p>
            <p className="num text-[13px]">{r.text}</p>
            {r.ideas.map((idea) => (
              <p key={idea} className="mt-0.5 text-[13px] text-muted-foreground">
                {idea}
              </p>
            ))}
          </div>
        ))}
      </div>
      {canSuggest && !advice && (
        <button onClick={suggest} disabled={busy} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-primary disabled:opacity-60">
          <Sparkles className="size-3.5" />
          {busy ? t("suggesting") : t("suggest")}
        </button>
      )}
    </section>
  );
}
