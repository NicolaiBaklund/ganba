"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/common/BottomSheet";

/** "Adjust plan" pill for the Training header. The sheet holds the AI adjust and "End plan". */
export function AdjustPlanButton() {
  const t = useTranslations("training");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  async function adjust() {
    setBusy(true);
    const res = await fetch("/api/training/adjust", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(() => null);
    setBusy(false);
    const body = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      const key = ["no_key", "invalid_key", "unavailable", "refused", "invalid_output"].includes(body?.error) ? body.error : "generic";
      return toast.error(t(`errors.${key}`));
    }
    setOpen(false);
    setText("");
    if (body.changes > 0) toast.success(t("adjustDone"));
    else toast(t("adjustNone"), { description: body.summary });
    router.refresh();
  }

  async function end() {
    setBusy(true);
    const res = await fetch("/api/training/plan", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(t("errors.generic"));
    setOpen(false);
    toast.success(t("ended"));
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-[7px] text-[13px] font-semibold"
      >
        <Sparkles className="size-4 text-primary" />
        {t("adjust")}
      </button>

      <BottomSheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setConfirmEnd(false);
        }}
        title={t("adjustTitle")}
      >
        <div className="flex flex-col gap-3 pt-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder={t("adjustPlaceholder")}
            className="rounded-md border border-border bg-muted p-4 outline-none focus:border-primary"
          />
          <p className="text-xs text-muted-foreground">{t("adjustCost")}</p>
          <Button className="h-12" disabled={busy || text.trim().length < 3} onClick={adjust}>
            {busy ? t("adjustBusy") : t("adjustSend")}
          </Button>
          <div className="mt-3 border-t border-border pt-3">
            {confirmEnd ? (
              <div className="text-sm">
                <p>{t("endConfirm")}</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="destructive" className="h-10 flex-1" disabled={busy} onClick={end}>
                    {t("endYes")}
                  </Button>
                  <Button variant="secondary" className="h-10 flex-1" onClick={() => setConfirmEnd(false)}>
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" className="py-1 text-sm font-semibold text-destructive" onClick={() => setConfirmEnd(true)}>
                {t("end")}
              </button>
            )}
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
