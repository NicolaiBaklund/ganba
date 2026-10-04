"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { estimateTotals } from "@loop/core";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/common/BottomSheet";
import { Chip } from "@/components/common/Chip";
import { ItemRow, type EditableItem } from "./ItemRow";
import { MEAL_ORDER } from "@/lib/dates";
import type { FoodEntryWithItems, MealType } from "@/lib/db/today";

export function EditEntrySheet({ entry, onClose }: { entry: FoodEntryWithItems | null; onClose: () => void }) {
  const t = useTranslations("food");
  const tm = useTranslations("meals");
  const router = useRouter();
  const [items, setItems] = useState<EditableItem[]>([]);
  const [meal, setMeal] = useState<MealType>("snack");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

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
        confidence: i.confidence,
      })),
    );
    setMeal(entry.meal_type);
    setConfirmDelete(false);
  }, [entry]);

  const totals = useMemo(() => estimateTotals(items), [items]);

  async function save() {
    if (!entry) return;
    setBusy(true);
    const res = await fetch(`/api/food/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mealType: meal,
        items: items.map(({ name, grams, kcal, protein_g, carbs_g, fat_g, confidence }) => ({
          name: name.trim() || "Item",
          grams,
          kcal,
          protein_g,
          carbs_g,
          fat_g,
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
