"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CoachSheet } from "@/components/coach/CoachSheet";
import type { FormView } from "@/lib/recovery/view";
import { FormRing } from "./FormRing";
import { FormSheet } from "./FormSheet";
import { drivers, formTemplate } from "./formText";

/** The top of Recovery: Form ring (tap → what counts), one sentence, and the coach when today looks rough. */
export function FormHero({ form, ai }: { form: FormView; ai: boolean }) {
  const t = useTranslations("recovery.form");
  const tw = useTranslations("workout.types");
  const [sheet, setSheet] = useState(false);
  const [coach, setCoach] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const f = form.today;
  const w = form.workout && (form.workout.status === "planned" || form.workout.status === "done") ? form.workout : null;
  const workout = w ? { name: tw(w.type).toLowerCase(), done: w.status === "done" } : null;

  useEffect(() => {
    if (!ai || !f) return;
    const ctrl = new AbortController();
    fetch("/api/recovery/form-note", { method: "POST", signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ sentences: { text: string }[] }>) : null))
      .then((d) => d?.sentences.length && setAiText(d.sentences.map((s) => s.text).join(" ")))
      .catch(() => null);
    return () => ctrl.abort();
  }, [ai, f]);

  if (!f) {
    return (
      <section className="mt-5 flex flex-col items-center">
        <FormRing score={null} band={null} size={168} label={t("label")} />
        <p className="mt-3 text-center text-[15px] text-muted-foreground">{t("none")}</p>
      </section>
    );
  }
  const sentence = aiText ?? formTemplate(f, workout, t);
  const draft = form.action && workout ? t("draft", { score: f.score, reasons: drivers(f.parts, t).down || t(`band.${f.band}`).toLowerCase(), workout: workout.name }) : "";
  return (
    <section className="mt-5 flex flex-col items-center">
      <button type="button" onClick={() => setSheet(true)} aria-label={t("aria", { score: f.score })} className="rounded-full">
        <FormRing score={f.score} band={f.band} size={168} label={t("label")} />
      </button>
      <p className="mt-3 max-w-[22rem] text-center text-[15px] leading-snug">{sentence}</p>
      <div className="mt-3 flex items-center gap-5 text-[14px] font-semibold">
        {form.action && form.workout && (
          <button type="button" onClick={() => setCoach(true)} className="rounded-md bg-foreground px-4 py-2.5 text-background">
            {t("action")}
          </button>
        )}
        <button type="button" onClick={() => setSheet(true)} className="py-2.5 text-primary">
          {t("what")}
        </button>
      </div>
      <FormSheet form={form} open={sheet} onClose={() => setSheet(false)} />
      {coach && form.workout && <CoachSheet aboutWorkoutId={form.workout.id} draft={draft} onClose={() => setCoach(false)} />}
    </section>
  );
}
