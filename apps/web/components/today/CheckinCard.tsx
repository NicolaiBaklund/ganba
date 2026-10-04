"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type CheckinView =
  | {
      id: string;
      status: "pending";
      kgPerWeek: number;
      goalRate: number;
      expenditure: number;
      newTarget: number;
      delta: number;
      loggedDays: number;
    }
  | { id: string; status: "insufficient_data"; reason: string };

export function CheckinCard({ view }: { view: CheckinView }) {
  const t = useTranslations("checkin");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  async function act(action: "accept" | "keep") {
    setBusy(true);
    const res = await fetch(`/api/checkin/${view.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(t("error"));
    toast.success(action === "accept" ? t("accepted") : t("kept"));
    router.refresh();
  }

  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  return (
    <section className="rounded-md border-l-4 border-primary bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarCheck className="size-4 text-primary" />
        <h2 className="cond text-lg leading-none">{t("title")}</h2>
      </div>
      {view.status === "pending" ? (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">{t("trend")}</p>
              <p className="num text-lg font-extrabold">
                {sign(view.kgPerWeek)} <span className="text-xs text-muted-foreground">{t("perWeek", { goal: sign(view.goalRate) })}</span>
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("burn")}</p>
              <p className="num text-lg font-extrabold">{view.expenditure} kcal</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{t("newTarget")}</p>
          <p className="num text-[40px] font-black leading-none [font-stretch:62%]">
            {view.newTarget}{" "}
            <span className={`text-base ${view.delta >= 0 ? "text-success" : "text-warning"}`}>({sign(view.delta)})</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("basedOn", { days: view.loggedDays })}</p>
          <div className="mt-4 flex gap-2">
            <Button className="h-11 flex-1 rounded-full" disabled={busy} onClick={() => act("accept")}>
              {t("accept")}
            </Button>
            <Button variant="secondary" className="h-11 flex-1 rounded-full" disabled={busy} onClick={() => act("keep")}>
              {t("keep")}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-start justify-between gap-3 text-sm">
          <p className="text-muted-foreground">{t(`insufficient.${view.reason}`)}</p>
          <button onClick={() => setHidden(true)} className="shrink-0 font-semibold text-primary">
            {t("dismiss")}
          </button>
        </div>
      )}
    </section>
  );
}
