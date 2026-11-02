"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { DailyNote } from "@/lib/health/note";

/** The coach's morning note (spec §7): plain text, and on an alert day one action and a way to keep the plan. */
export function MorningNote() {
  const t = useTranslations("health");
  const router = useRouter();
  const [note, setNote] = useState<DailyNote | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/health/note", { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<DailyNote>) : Promise.reject(new Error(String(r.status)))))
      .then(setNote)
      .catch((e) => e?.name !== "AbortError" && setFailed(true));
    return () => ctrl.abort();
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

  if (failed) return null;
  if (!note) {
    return (
      <section className="mt-8 space-y-2" aria-busy="true">
        <div className="h-5 w-full rounded bg-muted" />
        <div className="h-5 w-4/5 rounded bg-muted" />
      </section>
    );
  }
  const alert = note.alert && !note.alertDone;
  return (
    <section className="mt-8">
      <p className="text-[19px] font-[450] leading-[1.4] [font-stretch:100%]">{note.text}</p>
      <div className="mt-3 flex items-center gap-2.5">
        <span aria-hidden="true" className={`grid h-4 w-[22px] place-items-center rounded-[2px] text-[11px] font-black ${alert ? "bg-warning text-black" : "bg-foreground text-background"}`}>
          G
        </span>
        <span className="text-[13px] text-muted-foreground">{t("coach")}</span>
      </div>
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
