"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/common/BottomSheet";

/** "Adjust with AI" sheet and "End plan" with inline confirmation. */
export function PlanActions() {
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
    toast.success(t("ended"));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" className="h-12 rounded-2xl" onClick={() => setOpen(true)}>
        <Sparkles className="size-4 text-primary" />
        {t("adjust")}
      </Button>
      {confirmEnd ? (
        <div className="rounded-2xl bg-card p-4 text-sm">
          <p>{t("endConfirm")}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="destructive" className="h-10 flex-1 rounded-xl" disabled={busy} onClick={end}>
              {t("endYes")}
            </Button>
            <Button variant="secondary" className="h-10 flex-1 rounded-xl" onClick={() => setConfirmEnd(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <button className="py-2 text-sm text-muted-foreground" onClick={() => setConfirmEnd(true)}>
          {t("end")}
        </button>
      )}

      <BottomSheet open={open} onOpenChange={setOpen} title={t("adjustTitle")}>
        <div className="flex flex-col gap-3 pt-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder={t("adjustPlaceholder")}
            className="rounded-xl border border-border bg-muted p-4 outline-none focus:border-primary"
          />
          <p className="text-xs text-muted-foreground">{t("adjustCost")}</p>
          <Button className="h-12 rounded-xl" disabled={busy || text.trim().length < 3} onClick={adjust}>
            {busy ? t("adjustBusy") : t("adjustSend")}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
