"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { estimateTotals, type FoodEstimate } from "@loop/core";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/common/Chip";
import { PhotoPicker } from "@/components/photos/PhotoPicker";
import { QuickAddSheet } from "@/components/food/QuickAddSheet";
import { ItemRow, type EditableItem } from "@/components/food/ItemRow";
import { uploadPhoto } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";
import { MEAL_ORDER, mealTypeForHour } from "@/lib/dates";
import type { MealType } from "@/lib/db/today";

type Phase = "input" | "estimating" | "review" | "saving";
type ErrorKind = "no_key" | "invalid_key" | "unavailable" | "refused" | "invalid_output" | "photo_upload" | "network";
const DRAFT_KEY = "loop.foodDraft";

const toEditable = (e: FoodEstimate): EditableItem[] =>
  e.items.map((i) => ({ ...i, key: crypto.randomUUID() }));

export function FoodLogger({ hasKey, mode, date }: { hasKey: boolean; mode: "photo" | "text"; date?: string }) {
  const t = useTranslations("foodLog");
  const tm = useTranslations("meals");
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("input");
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [notes, setNotes] = useState("");
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [correction, setCorrection] = useState("");
  const [meal, setMeal] = useState<MealType>("snack");
  const [error, setError] = useState<ErrorKind | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);

  // Photos uploaded for an estimate but never saved are removed when replaced or when leaving the page.
  const uploadedRef = useRef<string[]>([]);
  const savedRef = useRef(false);
  const discardUploads = (paths: string[]) => {
    if (paths.length) createClient().storage.from("food").remove(paths).catch(() => {});
  };
  useEffect(() => {
    uploadedRef.current = photoPaths;
  }, [photoPaths]);
  useEffect(
    () => () => {
      if (!savedRef.current) discardUploads(uploadedRef.current);
    },
    [],
  );

  useEffect(() => {
    setMeal(mealTypeForHour(new Date().getHours()));
    try {
      // Restore the draft without overwriting anything typed before hydration finished.
      const stored = sessionStorage.getItem(DRAFT_KEY) ?? "";
      setText((current) => current || stored);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, text);
    } catch {}
  }, [text]);

  const totals = useMemo(() => estimateTotals(items), [items]);

  async function callEstimate(body: object): Promise<boolean> {
    let res: Response;
    try {
      res = await fetch("/api/food/estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setError("network");
      return false;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((data.error as ErrorKind) ?? "unavailable");
      return false;
    }
    setItems(toEditable(data.estimate));
    setNotes(data.estimate.notes ?? "");
    setEstimateId(data.estimateId);
    setError(null);
    return true;
  }

  async function estimate() {
    setError(null);
    setPhase("estimating");
    let paths = photoPaths;
    // Upload only once; retries reuse the stored paths.
    if (photos.length && !paths.length) {
      try {
        paths = await Promise.all(photos.map((p) => uploadPhoto("food", p)));
        setPhotoPaths(paths);
      } catch {
        setError("photo_upload");
        setPhase("input");
        return;
      }
    }
    const ok = await callEstimate({ text: text.trim() || undefined, photoPaths: paths });
    setPhase(ok ? "review" : "input");
  }

  async function correct() {
    if (!correction.trim() || !estimateId) return;
    setPhase("estimating");
    const ok = await callEstimate({ parentEstimateId: estimateId, text: correction.trim() });
    if (ok) setCorrection("");
    setPhase("review");
  }

  async function save() {
    setPhase("saving");
    const res = await fetch("/api/food/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "ai",
        mealType: meal,
        loggedAt: new Date().toISOString(),
        items: items.map(({ name, grams, kcal, protein_g, carbs_g, fat_g, alcohol_g, confidence }) => ({
          name: name.trim() || t("unnamed"),
          grams,
          kcal,
          protein_g,
          carbs_g,
          fat_g,
          alcohol_g,
          confidence,
        })),
        estimateId: estimateId ?? undefined,
        photoPaths,
        ...(date ? { localDate: date } : {}),
      }),
    }).catch(() => null);
    if (!res?.ok) {
      toast.error(t("saveError"));
      setPhase("review");
      return;
    }
    savedRef.current = true;
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
    toast.success(t("saved"));
    router.push(date ? `/today?date=${date}` : "/today");
    router.refresh();
  }

  const busy = phase === "estimating" || phase === "saving";
  const canEstimate = hasKey && (text.trim().length > 0 || photos.length > 0) && !busy;

  return (
    <main className="flex min-h-[calc(100dvh-8rem)] flex-col gap-4 px-[18px] pt-4">
      <header className="flex items-center gap-3">
        <Link href="/today" aria-label={t("back")} className="-ml-1 p-1">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="cond text-[34px] leading-none">{t("title")}</h1>
      </header>
      {date && <p className="-mt-2 text-sm text-primary">{t("forDate", { date })}</p>}

      {!hasKey && (
        <div className="rounded-md border-l-4 border-primary bg-card p-4 text-sm">
          <p>{t("noKey")}</p>
          <div className="mt-3 flex gap-4">
            <Link href="/profile" className="font-semibold text-primary">
              {t("addKey")}
            </Link>
            <button onClick={() => setQuickOpen(true)} className="font-semibold text-primary">
              {t("quickInstead")}
            </button>
          </div>
        </div>
      )}

      {(phase === "input" || (phase === "estimating" && !items.length)) && (
        <section className="flex flex-col gap-3">
          <PhotoPicker photos={photos} onChange={(p) => { setPhotos(p); discardUploads(photoPaths); setPhotoPaths([]); }} max={4} label={t("photo")} autoOpen={mode === "photo" && hasKey} />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={t("placeholder")}
            className="rounded-md border border-border bg-card p-4 outline-none focus:border-primary"
          />
          {error && <ErrorBox kind={error} onRetry={estimate} onQuick={() => setQuickOpen(true)} />}
          <Button size="lg" className="h-14 text-base" disabled={!canEstimate} onClick={estimate}>
            {phase === "estimating" ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
            {phase === "estimating" ? t("estimating") : t("estimate")}
          </Button>
        </section>
      )}

      {(phase === "review" || phase === "saving" || (phase === "estimating" && items.length > 0)) && (
        <section className="flex flex-col gap-3">
          {items.length === 0 ? (
            <div className="rounded-md bg-card p-4 text-sm">
              <p className="font-medium">{t("noFood")}</p>
              {notes && <p className="mt-1 text-muted-foreground">{notes}</p>}
              <button onClick={() => setQuickOpen(true)} className="mt-3 font-semibold text-primary">
                {t("quickInstead")}
              </button>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm text-muted-foreground">{t("total")}</p>
                <p className="num text-[72px] font-black leading-[.9] [font-stretch:62%]">
                  {Math.round(totals.kcal)} <span className="text-xl font-bold text-muted-foreground [font-stretch:75%]">kcal</span>
                </p>
                <p className="num mt-1 flex gap-4 text-[15px] font-bold">
                  <span className="text-protein-ink">{Math.round(totals.proteinG)}g P</span>
                  <span className="text-carbs-ink">{Math.round(totals.carbsG)}g C</span>
                  <span className="text-fat-ink">{Math.round(totals.fatG)}g F</span>
                </p>
                {notes && <p className="mt-2 text-xs text-muted-foreground">{notes}</p>}
              </div>
              {items.map((it, i) => (
                <ItemRow
                  key={it.key}
                  item={it}
                  onChange={(n) => setItems(items.map((x, j) => (j === i ? n : x)))}
                  onRemove={() => setItems(items.filter((_, j) => j !== i))}
                />
              ))}
              <button
                onClick={() =>
                  setItems([...items, { key: crypto.randomUUID(), name: "", grams: null, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, confidence: null }])
                }
                className="flex items-center gap-1.5 self-start text-sm font-semibold text-primary"
              >
                <Plus className="size-4" /> {t("addItem")}
              </button>
            </>
          )}

          <div className="flex gap-2">
            <input
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && correct()}
              placeholder={t("correctionPlaceholder")}
              className="h-12 min-w-0 flex-1 rounded-md border border-border bg-card px-4 text-sm outline-none focus:border-primary"
            />
            <Button variant="secondary" className="h-12" disabled={!correction.trim() || busy} onClick={correct}>
              {phase === "estimating" ? <Loader2 className="size-4 animate-spin" /> : t("update")}
            </Button>
          </div>
          {error && <ErrorBox kind={error} onRetry={correct} onQuick={() => setQuickOpen(true)} />}

          <div className="flex flex-wrap gap-2">
            {MEAL_ORDER.map((m) => (
              <Chip key={m} selected={meal === m} onClick={() => setMeal(m)} className="h-9 px-3">
                {tm(m)}
              </Chip>
            ))}
          </div>
          <Button size="lg" className="h-14 text-base" disabled={!items.length || busy} onClick={save}>
            {t("save")}
          </Button>
        </section>
      )}

      <QuickAddSheet open={quickOpen} onOpenChange={setQuickOpen} />
    </main>
  );
}

function ErrorBox({ kind, onRetry, onQuick }: { kind: ErrorKind; onRetry: () => void; onQuick: () => void }) {
  const t = useTranslations("foodLog");
  const retryable = kind === "unavailable" || kind === "network" || kind === "photo_upload";
  return (
    <div className="rounded-md border-l-4 border-destructive bg-card p-4 text-sm">
      <p>{t(`errors.${kind}`)}</p>
      <div className="mt-2 flex gap-3 font-semibold">
        {kind === "invalid_key" || kind === "no_key" ? (
          <Link href="/profile" className="text-primary">{t("addKey")}</Link>
        ) : retryable ? (
          <button onClick={onRetry} className="text-primary">{t("retry")}</button>
        ) : null}
        <button onClick={onQuick} className="text-primary">{t("quickInstead")}</button>
      </div>
    </div>
  );
}
