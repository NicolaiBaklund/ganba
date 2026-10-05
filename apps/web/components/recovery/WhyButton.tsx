"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type { DayAnswer } from "@loop/core";

export function WhyButton({ date }: { date: string }) {
  const t = useTranslations("recovery.ai");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ answer: DayAnswer; stale: boolean } | { error: string } | null>(null);

  async function ask(refresh = false) {
    setBusy(true);
    const r = await fetch(`/api/recovery/day/${date}/why`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh }),
    }).catch(() => null);
    setRes(((await r?.json().catch(() => null)) ?? { error: "unavailable" }) as typeof res);
    setBusy(false);
  }

  if (!res)
    return (
      <button onClick={() => ask()} disabled={busy} className="flex items-center gap-1.5 text-sm font-semibold text-primary">
        <Sparkles className="size-4" /> {t("why")}
      </button>
    );
  if ("error" in res) return <p className="text-[13px] text-muted-foreground">{res.error === "not_enough_data" ? t("notEnough") : res.error === "no_key" ? t("noKey") : t("error")}</p>;
  return (
    <div>
      {res.answer.sentences.length ? res.answer.sentences.map((s) => <p key={s.text} className="mt-1 text-[15px]">{s.text}</p>) : <p className="text-[13px] text-muted-foreground">{t("nothing")}</p>}
      {res.stale && (
        <p className="mt-2 text-[13px] text-muted-foreground">
          {t("stale")}{" "}
          <button onClick={() => ask(true)} disabled={busy} className="font-semibold text-primary">{t("ask")}</button>
        </p>
      )}
    </div>
  );
}
