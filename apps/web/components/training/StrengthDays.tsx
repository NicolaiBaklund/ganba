"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DayPicker } from "@/components/common/DayPicker";

/** Optional strength days in the plan (spec 2026-11-10 §7a): a link until used, then the days with a save button. */
export function StrengthDays({ days: saved }: { days: number[] }) {
  const t = useTranslations("training");
  const router = useRouter();
  const [open, setOpen] = useState(saved.length > 0);
  const [days, setDays] = useState(saved);
  const [busy, setBusy] = useState(false);
  const changed = [...days].sort().join() !== [...saved].sort().join();

  async function save() {
    setBusy(true);
    const res = await fetch("/api/training/plan/strength-days", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ days }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(t("crossError"));
    router.refresh();
  }

  if (!open)
    return (
      <button type="button" className="mt-3 self-start text-sm font-semibold text-primary" onClick={() => setOpen(true)}>
        {t("addStrengthDays")}
      </button>
    );
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm text-muted-foreground">{t("strengthDays")}</p>
      <DayPicker selected={days} blocked={[]} disabled={busy} onToggle={(d) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])} />
      {changed && (
        <Button className="mt-3 h-11 px-5" disabled={busy} onClick={save}>
          {t("crossSave")}
        </Button>
      )}
    </div>
  );
}
