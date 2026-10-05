"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { estimateTotals, localDate } from "@loop/core";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/common/BottomSheet";
import { Chip } from "@/components/common/Chip";
import { ItemRow, type EditableItem } from "./ItemRow";
import { MEAL_ORDER } from "@/lib/dates";
import type { FoodEntryWithItems, MealType } from "@/lib/db/today";

export function EditEntrySheet({ entry, timezone, onClose }: { entry: FoodEntryWithItems | null; timezone: string; onClose: () => void }) {
  const t = useTranslations("food");
  const tm = useTranslations("meals");
  const router = useRouter();
  const [items, setItems] = useState<EditableItem[]>([]);
  const [meal, setMeal] = useState<MealType>("snack");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState("");
  const [initialTime, setInitialTime] = useState("");

  useEffect(() => {
    if (!entry) return;
    setItems(
      entry.items.map((i) => ({
        key: i.id,
        name: i.name,
        grams: i.grams == null ? null : Number(i.grams),
        kcal: Number(i.kcal),
        protein_g: Number(i.protein_g),
        carbs_g: Number(i.carbs_g),
        fat_g: Number(i.fat_g),
        alcohol_g: Number(i.alcohol_g ?? 0),
        confidence: i.confidence,
      })),
    );
    setMeal(entry.meal_type);
    setConfirmDelete(false);
    // Time is only known when the entry was logged on its own day; otherwise the field starts empty.
    const at = new Date(entry.logged_at);
    const known = localDate(timezone, at) === entry.local_date;
    const hhmm = known ? new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at) : "";
    setTime(hhmm);
    setInitialTime(hhmm);
  }, [entry, timezone]);

  const totals = useMemo(() => estimateTotals(items), [items]);

  async function save() {
    if (!entry) return;
    setBusy(true);
    const res = await fetch(`/api/food/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mealType: meal,
        ...(time && time !== initialTime ? { time } : {}),
        items: items.map(({ name, grams, kcal, protein_g, carbs_g, fat_g, alcohol_g, confidence }) => ({
          name: name.trim() || "Item",
          grams,
          kcal,
          protein_g,
          carbs_g,
          fat_g,
          alcohol_g,
          confidence,
        })),
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(t("saveError"));
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!entry) return;
    setBusy(true);
    const res = await fetch(`/api/food/entries/${entry.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(t("deleteError"));
    onClose();
    router.refresh();
  }

  return (
    <BottomSheet open={!!entry} onOpenChange={(o) => !o && onClose()} title={t("edit")}>
      <div className="flex flex-col gap-3 pt-2">
        <p className="num text-[44px] font-black leading-none [font-stretch:62%]">
          {Math.round(totals.kcal)} <span className="text-sm font-medium text-muted-foreground">kcal</span>
        </p>
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
        <div className="flex flex-wrap gap-2">
          {MEAL_ORDER.map((m) => (
            <Chip key={m} selected={meal === m} onClick={() => setMeal(m)} className="h-9 px-3">
              {tm(m)}
            </Chip>
          ))}
        </div>
        <label className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm">
          <span className="font-semibold">{t("time")}</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="num rounded-md bg-muted px-3 py-1.5 text-base"
            aria-label={t("time")}
          />
        </label>
        {!initialTime && <p className="-mt-2 text-xs text-muted-foreground">{t("timeUnknown")}</p>}
        <Button size="lg" className="h-12" disabled={!items.length || busy} onClick={save}>
          {t("save")}
        </Button>
        {confirmDelete ? (
          <Button variant="destructive" size="lg" className="h-12" disabled={busy} onClick={remove}>
            {t("confirmDelete")}
          </Button>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="py-2 text-sm font-medium text-destructive">
            {t("delete")}
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
