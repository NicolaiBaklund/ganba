"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/common/BottomSheet";
import { Chip } from "@/components/common/Chip";
import { NumberField, parseNum } from "@/components/common/NumberField";
import { MEAL_ORDER, mealTypeForHour } from "@/lib/dates";
import { postOrQueue } from "@/lib/offline-queue";
import type { MealType } from "@/lib/db/today";

export function QuickAddSheet({
  open,
  onOpenChange,
  date,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Local date to log to when adding to a past day; omitted = now. */
  date?: string;
}) {
  const t = useTranslations("quickAdd");
  const tm = useTranslations("meals");
  const router = useRouter();
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [name, setName] = useState("");
  const [showMacros, setShowMacros] = useState(false);
  const [meal, setMeal] = useState<MealType>("snack");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMeal(mealTypeForHour(new Date().getHours()));
      setKcal("");
      setProtein("");
      setCarbs("");
      setFat("");
      setName("");
      setShowMacros(false);
    }
  }, [open]);

  const kcalNum = parseNum(kcal);

  async function save() {
    if (kcalNum == null) return;
    setSaving(true);
    const result = await postOrQueue("/api/food/entries", {
      source: "quick",
      mealType: meal,
      loggedAt: new Date().toISOString(),
      ...(date ? { localDate: date } : {}),
      items: [
        {
          name: name.trim() || t("defaultName"),
          kcal: kcalNum,
          protein_g: parseNum(protein) ?? 0,
          carbs_g: parseNum(carbs) ?? 0,
          fat_g: parseNum(fat) ?? 0,
        },
      ],
    });
    setSaving(false);
    if (result === "error") return toast.error(t("error"));
    toast.success(result === "queued" ? t("queued") : t("saved"));
    onOpenChange(false);
    router.refresh();
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("title")}>
      <div className="flex flex-col gap-4 pt-2">
        {date && <p className="-mt-2 text-sm text-primary">{t("forDate", { date })}</p>}
        <NumberField label={t("kcal")} unit="kcal" value={kcal} onChange={setKcal} decimal={false} />
        {showMacros ? (
          <div className="grid grid-cols-3 gap-2">
            <NumberField label={t("protein")} unit="g" value={protein} onChange={setProtein} />
            <NumberField label={t("carbs")} unit="g" value={carbs} onChange={setCarbs} />
            <NumberField label={t("fat")} unit="g" value={fat} onChange={setFat} />
          </div>
        ) : (
          <button onClick={() => setShowMacros(true)} className="self-start text-sm font-medium text-primary">
            {t("addMacros")}
          </button>
        )}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          className="h-12 rounded-xl border border-border bg-muted px-4 outline-none focus:border-primary"
        />
        <div className="flex flex-wrap gap-2">
          {MEAL_ORDER.map((m) => (
            <Chip key={m} selected={meal === m} onClick={() => setMeal(m)} className="h-9 px-3">
              {tm(m)}
            </Chip>
          ))}
        </div>
        <Button size="lg" className="h-14 rounded-2xl text-base" disabled={kcalNum == null || saving} onClick={save}>
          {t("save")}
        </Button>
      </div>
    </BottomSheet>
  );
}
