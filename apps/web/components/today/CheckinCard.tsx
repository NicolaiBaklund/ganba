"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/common/BottomSheet";

export interface CheckinView {
  id: string;
  kgPerWeek: number;
  goalRate: number;
  /** Resting calories now and the suggested new value (training and steps come on top each day). */
  currentKcal: number;
  proposedKcal: number;
  loggedDays: number;
}

/** A new resting target from the weekly check-in: one row on Today, the details and the choice in a sheet. */
export function CheckinCard({ view }: { view: CheckinView }) {
  const t = useTranslations("checkin");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function act(action: "accept" | "keep") {
    setBusy(true);
    const res = await fetch(`/api/checkin/${view.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(t("error"));
    setOpen(false);
    toast.success(action === "accept" ? t("accepted") : t("kept"));
    router.refresh();
  }

  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border py-3">
        <span aria-hidden="true" className="h-10 w-1 shrink-0 bg-primary" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{t("row")}</span>
          <span className="num block text-[13px] text-muted-foreground">{t("rowSub", { from: view.currentKcal, to: view.proposedKcal })}</span>
        </span>
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="h-10 shrink-0 rounded-full border border-border px-4 text-[15px] font-bold">
          {t("review")}
        </button>
      </div>
      <BottomSheet open={open} onOpenChange={setOpen} title={t("title")}>
        <p className="mt-4 text-sm text-muted-foreground">{t("trend")}</p>
        <p className="num text-lg font-extrabold">
          {sign(view.kgPerWeek)} <span className="text-xs text-muted-foreground">{t("perWeek", { goal: sign(view.goalRate) })}</span>
        </p>
        <p className="mt-4 text-sm text-muted-foreground">{t("resting")}</p>
        <p className="num text-[40px] font-black leading-none [font-stretch:62%]">
          <span className="text-muted-foreground">{view.currentKcal} →</span> {view.proposedKcal}{" "}
          <span className={`text-base ${view.proposedKcal >= view.currentKcal ? "text-success" : "text-warning"}`}>({sign(view.proposedKcal - view.currentKcal)})</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("restingNote")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("basedOn", { days: view.loggedDays })}</p>
        <div className="mt-5 flex gap-2">
          <Button className="h-11 flex-1 rounded-full" disabled={busy} onClick={() => act("accept")}>
            {t("accept")}
          </Button>
          <Button variant="secondary" className="h-11 flex-1 rounded-full" disabled={busy} onClick={() => act("keep")}>
            {t("keep")}
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
