"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { DailyNote } from "@/lib/health/note";
import { GARMIN_SYNCED } from "@/components/common/GarminSync";

/** The coach's morning note (spec §7): plain text, and on an alert day one action and a way to keep the plan. */
export function MorningNote() {
  const t = useTranslations("health");
  const router = useRouter();
  // undefined while loading; null when there is nothing to say (no plan, no alert).
  const [note, setNote] = useState<DailyNote | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const load = () =>
      fetch("/api/health/note", { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<DailyNote | null>) : Promise.reject(new Error(String(r.status)))))
        .then(setNote)
        .catch((e) => e?.name !== "AbortError" && setFailed(true));
    void load();
    // Waiting for last night's sleep: ask again when the sync started on open has finished.
    window.addEventListener(GARMIN_SYNCED, load);
    return () => {
      ctrl.abort();
      window.removeEventListener(GARMIN_SYNCED, load);
    };
  }, []);

  async function act(keep: boolean) {
    setBusy(true);
    const res = await fetch("/api/health/swap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keep }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(t("error"));
    setNote((n) => (n ? { ...n, alertDone: true, swap: null } : n));
    if (!keep) {
      toast.success(t("swapped"));
      router.refresh();
    }
  }

  if (failed || note === null) return null;
  if (!note) {
    return (
      <section className="mt-7 space-y-2" aria-busy="true">
        <div className="h-5 w-full rounded bg-muted" />
        <div className="h-5 w-4/5 rounded bg-muted" />
      </section>
    );
  }
  if (note.waiting) return <p className="mt-7 text-[13px] text-muted-foreground">{t("waiting")}</p>;
  const alert = note.alert && !note.alertDone;
  return (
    <section className="mt-7">
      <p className="text-[17px] font-[450] leading-[1.4] [font-stretch:100%]">{note.text}</p>
      <p className={`mt-2 text-[13px] ${alert ? "font-semibold text-warning" : "text-muted-foreground"}`}>{t("coach")}</p>
      {alert && (
        <div className="mt-4 flex items-center gap-5">
          {note.swap && (
            <button type="button" disabled={busy} onClick={() => act(false)} className="h-12 rounded-full bg-foreground px-5 text-[15px] font-bold text-background disabled:opacity-60">
              {t("swap", { km: note.swap.km })}
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => act(true)} className="h-12 px-1 text-[15px] font-semibold text-muted-foreground disabled:opacity-60">
            {t(note.swap ? "keep" : "gotIt")}
          </button>
        </div>
      )}
    </section>
  );
}
