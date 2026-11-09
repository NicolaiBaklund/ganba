"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Minus, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import type { Measure, SetRow } from "@loop/core";
import type { PickRow, SessionView } from "@/lib/strength/view";
import { setsLabel } from "@/lib/strength/format";
import { BottomSheet } from "@/components/common/BottomSheet";
import { ExercisePicker } from "./ExercisePicker";
import { cn } from "@/lib/utils";

type Item = PickRow & { sets: SetRow[]; saved: boolean; open: boolean };

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

const parseNum = (s: string) => {
  const v = Number(s.replace(",", "."));
  return s.trim() === "" || Number.isNaN(v) ? null : v;
};

/** − value + with the number typed in directly (kg as decimals, reps and seconds whole). */
function Stepper({ value, step, unit, placeholder, decimal, onChange, label }: { value: number | null; step: number; unit: string; placeholder?: string; decimal?: boolean; onChange: (v: number | null) => void; label: string }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value == null ? "" : String(value));
  // "−" on an empty field (bodyweight) leaves it empty rather than 0.
  const bump = (d: number) => (value == null && d < 0 ? undefined : onChange(Math.max(0, Math.round(((value ?? 0) + d) * 100) / 100)));
  const commit = (s: string) => {
    const v = parseNum(s);
    return v == null ? null : Math.max(0, decimal ? v : Math.round(v));
  };
  return (
    <span className="flex h-10 items-center justify-between rounded-[10px] bg-muted px-1">
      <button type="button" aria-label={`− ${label}`} onClick={() => bump(-step)} className="grid size-8 place-items-center text-muted-foreground">
        <Minus className="size-4" />
      </button>
      <span className="flex items-baseline gap-0.5">
        <input
          aria-label={label}
          inputMode={decimal ? "decimal" : "numeric"}
          value={shown}
          placeholder={placeholder}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setText(e.target.value);
            // Committed while typing: a tap on ✓ may not blur the field first (iOS).
            if (commit(e.target.value) != null) onChange(commit(e.target.value));
          }}
          onBlur={() => {
            if (text != null) onChange(commit(text));
            setText(null);
          }}
          className="num w-12 bg-transparent text-right text-lg font-extrabold outline-none placeholder:text-foreground"
        />
        <small className="text-xs text-muted-foreground">{unit}</small>
      </span>
      <button type="button" aria-label={`+ ${label}`} onClick={() => bump(step)} className="grid size-8 place-items-center text-muted-foreground">
        <Plus className="size-4" />
      </button>
    </span>
  );
}

/** The session (spec §6.2): saved exercises fold to one line; open ones are sets with − / + and one ✓. */
export function SessionEditor({ view }: { view: SessionView }) {
  const t = useTranslations("strength");
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(() => view.exercises.map((e) => ({ ...e, saved: true, open: false })));
  const [catalog, setCatalog] = useState(view.catalog);
  const [picking, setPicking] = useState(view.exercises.length === 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = (key: string, f: (i: Item) => Item) => setItems((xs) => xs.map((x) => (x.key === key ? f(x) : x)));
  const fav = (key: string) => catalog.find((c) => c.key === key)?.favorite ?? false;

  /** A change in the first set carries down to the sets that still matched it. */
  function setField(key: string, idx: number, field: "reps" | "kg" | "seconds", v: number | null) {
    update(key, (it) => {
      const old = it.sets[idx]![field];
      return { ...it, sets: it.sets.map((s, i) => (i === idx || (idx === 0 && i > 0 && s[field] === old) ? { ...s, [field]: v } : s)) };
    });
  }

  /** Saves one exercise; false (and it stays open) when that fails. */
  async function save(it: Item, keepBusy = false): Promise<boolean> {
    if (!keepBusy) setBusy(it.key);
    try {
      await post("/api/strength/session", { action: "save", sessionId: view.id, key: it.key, position: items.findIndex((x) => x.key === it.key), sets: it.sets.map(({ reps, kg, seconds }) => ({ reps, kg, seconds })) });
      update(it.key, (x) => ({ ...x, saved: true, open: false }));
      return true;
    } catch {
      toast.error(t("saveError"));
      return false;
    } finally {
      if (!keepBusy) setBusy(null);
    }
  }

  async function remove(it: Item) {
    if (it.saved) {
      try {
        await post("/api/strength/session", { action: "remove", sessionId: view.id, key: it.key });
      } catch {
        return toast.error(t("saveError"));
      }
    }
    setItems((xs) => xs.filter((x) => x.key !== it.key));
  }

  async function star(key: string) {
    const on = !fav(key);
    setCatalog((cs) => cs.map((c) => (c.key === key ? { ...c, favorite: on } : c)));
    await post("/api/strength/favorite", { key, on }).catch(() => {
      setCatalog((cs) => cs.map((c) => (c.key === key ? { ...c, favorite: !on } : c)));
      toast.error(t("saveError"));
    });
  }

  async function finish() {
    setBusy("finish");
    // Open exercises are saved on Finish too; if one fails, nothing is finished and it stays open.
    for (const it of items.filter((x) => !x.saved || x.open)) {
      if (!(await save(it, true))) return setBusy(null);
    }
    try {
      await post("/api/strength/session", { action: "finish", sessionId: view.id });
      router.push("/training");
      router.refresh();
    } catch {
      toast.error(t("saveError"));
      setBusy(null);
    }
  }

  async function del() {
    setBusy("delete");
    try {
      await post("/api/strength/session", { action: "delete", sessionId: view.id });
      router.push("/training");
      router.refresh();
    } catch {
      toast.error(t("saveError"));
      setBusy(null);
    }
  }

  const unit = (m: Measure) => (m === "time" ? t("sec") : t("kg"));

  return (
    <>
      <div className="mt-3">
        {!items.length && <p className="py-3 text-[15px] text-muted-foreground">{t("empty")}</p>}
        {items.map((it) => {
          const starBtn = (
            <button type="button" aria-label={t("favourite")} aria-pressed={fav(it.key)} onClick={() => star(it.key)} className={cn("shrink-0", fav(it.key) ? "text-[#ffd23f]" : "text-muted-foreground")}>
              <Star className="size-4" fill={fav(it.key) ? "currentColor" : "none"} />
            </button>
          );
          if (it.saved && !it.open) {
            return (
              <div key={it.key} className="flex items-center gap-2.5 border-b border-border py-3.5">
                {starBtn}
                <button type="button" onClick={() => update(it.key, (x) => ({ ...x, open: true }))} className="flex min-w-0 flex-1 items-baseline justify-between gap-3 text-left">
                  <span className="truncate text-[17px] font-bold text-muted-foreground">{it.name}</span>
                  <span className="num shrink-0 font-extrabold text-muted-foreground">{setsLabel(it.sets, it.measure)}</span>
                </button>
              </div>
            );
          }
          return (
            <section key={it.key} className="border-b border-border pb-3 pt-3.5">
              <div className="flex items-center gap-2.5">
                {starBtn}
                <h2 className="min-w-0 flex-1 truncate text-[17px] font-bold">{it.name}</h2>
                <button type="button" aria-label={t("done")} disabled={busy === it.key} onClick={() => save(it)} className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground text-background disabled:opacity-60">
                  <Check className="size-5" />
                </button>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {it.sets.map((s, i) => (
                  <div key={i} className={cn("grid items-center gap-2", it.measure === "time" ? "grid-cols-[22px_1fr]" : "grid-cols-[22px_1fr_1fr]")}>
                    <span className="text-[13px] text-muted-foreground">{i + 1}</span>
                    {it.measure === "time" ? (
                      <Stepper label={t("sec")} value={s.seconds} step={5} unit={t("sec")} onChange={(v) => setField(it.key, i, "seconds", v)} />
                    ) : (
                      <>
                        <Stepper label={t("reps")} value={s.reps} step={1} unit={t("reps")} onChange={(v) => setField(it.key, i, "reps", v)} />
                        <Stepper label={t("kg")} value={s.kg} step={1} unit={s.kg == null && it.measure === "bw" ? "" : unit(it.measure)} placeholder={it.measure === "bw" ? t("bw") : "–"} decimal onChange={(v) => setField(it.key, i, "kg", v)} />
                      </>
                    )}
                  </div>
                ))}
              </div>
              {it.hint && (
                <button
                  type="button"
                  onClick={() => update(it.key, (x) => ({ ...x, hint: null, sets: x.sets.map((s) => (x.hint!.kg ? { ...s, kg: Math.round(((s.kg ?? 0) + x.hint!.kg) * 100) / 100 } : { ...s, reps: (s.reps ?? 0) + 1 })) }))}
                  className="mt-2 text-left text-[13px] font-bold text-success"
                >
                  {it.hint.kg ? t("hintKg", { kg: it.hint.kg }) : t("hintReps")}
                </button>
              )}
              <div className="mt-2 flex gap-5 text-[13px] text-muted-foreground">
                <button type="button" onClick={() => update(it.key, (x) => ({ ...x, sets: [...x.sets, { ...x.sets.at(-1)!, setNo: x.sets.length + 1 }] }))}>
                  {t("addSet")}
                </button>
                {it.sets.length > 1 && (
                  <button type="button" onClick={() => update(it.key, (x) => ({ ...x, sets: x.sets.slice(0, -1) }))}>
                    {t("removeSet")}
                  </button>
                )}
                <button type="button" className="ml-auto" onClick={() => remove(it)}>
                  {t("remove")}
                </button>
              </div>
            </section>
          );
        })}
        <button type="button" onClick={() => setPicking(true)} className="flex w-full items-center justify-between py-3.5 text-left">
          <span className="text-[17px] font-bold text-muted-foreground">{t("addExercise")}</span>
          <span className="grid size-9 place-items-center rounded-full border border-border">
            <Plus className="size-4" />
          </span>
        </button>
      </div>

      <button type="button" disabled={!!busy} onClick={finish} className="mt-4 h-12 w-full rounded-full bg-foreground text-base font-extrabold text-background disabled:opacity-60">
        {t("finish")}
      </button>
      <button type="button" onClick={() => setConfirmDelete(true)} className="mt-6 self-start text-[13px] text-muted-foreground">
        {t("delete")}
      </button>

      <ExercisePicker
        open={picking}
        onOpenChange={setPicking}
        rows={catalog.filter((c) => !items.some((i) => i.key === c.key))}
        onStar={star}
        onAdd={(row) => {
          setItems((xs) => [...xs, { ...row, sets: row.prefill, saved: false, open: true }]);
          setPicking(false);
        }}
        onCreated={(row) => {
          setCatalog((cs) => [...cs, row]);
          setItems((xs) => [...xs, { ...row, sets: row.prefill, saved: false, open: true }]);
          setPicking(false);
        }}
      />
      <BottomSheet open={confirmDelete} onOpenChange={setConfirmDelete} title={t("deleteConfirm")}>
        <div className="mt-5 flex gap-2">
          <button type="button" disabled={busy === "delete"} onClick={del} className="h-11 flex-1 rounded-full bg-destructive font-bold text-white disabled:opacity-60">
            {t("deleteYes")}
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="h-11 flex-1 rounded-full border border-border font-bold">
            {t("cancel")}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
