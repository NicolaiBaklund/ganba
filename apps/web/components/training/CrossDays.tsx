"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/common/Chip";

const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** Optional easy sessions of the other sport: a link until used, then the days with a save button. */
export function CrossDays({ sport, weekdays, cross }: { sport: "run" | "ride"; weekdays: number[]; cross: number[] }) {
  const t = useTranslations("training");
  const tw = useTranslations("weekdays");
  const router = useRouter();
  const [open, setOpen] = useState(cross.length > 0);
  const [days, setDays] = useState(cross);
  const [busy, setBusy] = useState(false);
  const changed = [...days].sort().join() !== [...cross].sort().join();
  const other = sport === "ride" ? "Runs" : "Rides";

  async function save() {
    setBusy(true);
    const res = await fetch("/api/training/plan/cross", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(t("crossError"));
    router.refresh();
  }

  if (!open)
    return (
      <button type="button" className="mt-4 self-start text-sm font-semibold text-primary" onClick={() => setOpen(true)}>
        {t(`addCross${other}`)}
      </button>
    );
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm text-muted-foreground">{t(`cross${other}`)}</p>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEK.map((d) => (
          <Chip
            key={d}
            selected={days.includes(d)}
            disabled={weekdays.includes(d) || busy}
            onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
            className="h-11 px-0 text-xs"
          >
            {tw(String(d))}
          </Chip>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{t("crossHint")}</p>
      {changed && (
        <Button className="mt-3 h-11 px-5" disabled={busy} onClick={save}>
          {t("crossSave")}
        </Button>
      )}
    </div>
  );
}
