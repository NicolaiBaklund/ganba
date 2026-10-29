"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NumberField, parseNum } from "@/components/common/NumberField";
import { clockInput, fmtClock, parseClock } from "@/lib/training/format";

/**
 * Without Garmin: "Done" logs the session's run by hand (km prefilled, time optional), and "Undo" takes a run
 * logged by hand back (spec 2026-10-29 §7).
 */
export function ManualDone({ workoutId, plannedKm, done, manual }: { workoutId: string; plannedKm: number; done: boolean; manual: boolean }) {
  const t = useTranslations("workout");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [km, setKm] = useState(String(plannedKm));
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const kmNum = parseNum(km);
  // Any sport's time (a fast ride is no running pace).
  const timeS = time.trim() ? parseClock(time) : null;
  const timeBad = !!time.trim() && timeS == null;

  async function send(method: "POST" | "DELETE") {
    setBusy(true);
    const res = await fetch(`/api/training/workout/${workoutId}/done`, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "POST" ? JSON.stringify({ km: kmNum, timeS }) : undefined,
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(t("logError"));
    setOpen(false);
    router.refresh();
  }

  if (done) {
    if (!manual) return null;
    return (
      <div className="mt-2 flex items-center justify-between text-[13px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Check className="size-4 text-success" />
          {t("loggedByHand")}
        </span>
        <button type="button" disabled={busy} onClick={() => send("DELETE")} className="font-semibold text-primary disabled:opacity-50">
          {t("undo")}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <Button className="mt-3 h-12 w-full" onClick={() => setOpen(true)}>
        <Check className="size-4" />
        {t("markDone")}
      </Button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md bg-card p-4">
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={t("distance")} unit="km" value={km} onChange={setKm} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">{t("timeOptional")}</span>
          <input
            inputMode="numeric"
            placeholder="mm:ss"
            value={time}
            onChange={(e) => setTime(clockInput(e.target.value.replace(/:/g, "")))}
            className="num h-14 rounded-md border border-border bg-background px-4 text-lg outline-none focus:border-primary"
          />
          {time.trim() && <span className={timeBad ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{timeBad ? t("timeInvalid") : `= ${fmtClock(timeS!)}`}</span>}
        </label>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" className="h-11 flex-1" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
        <Button className="h-11 flex-1" disabled={busy || kmNum == null || kmNum <= 0 || timeBad} onClick={() => send("POST")}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
