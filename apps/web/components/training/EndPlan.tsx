"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

/** A quiet "End plan" at the bottom of Training, with a confirmation step. */
export function EndPlan() {
  const t = useTranslations("training");
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function end() {
    setBusy(true);
    const res = await fetch("/api/training/plan", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(t("endError"));
    router.refresh();
  }

  return (
    <div className="mt-10 border-t border-border pt-4 text-sm">
      {confirm ? (
        <>
          <p className="text-muted-foreground">{t("endExplain")}</p>
          <div className="mt-2 flex gap-4">
            <button type="button" disabled={busy} onClick={end} className="font-semibold text-destructive">
              {t("endConfirm")}
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="text-muted-foreground">
              {t("endCancel")}
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} className="text-muted-foreground">
          {t("endPlan")}
        </button>
      )}
    </div>
  );
}
