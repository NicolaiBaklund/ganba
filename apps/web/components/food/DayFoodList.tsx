"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Zap } from "lucide-react";
import { MEAL_ORDER } from "@/lib/dates";
import type { FoodEntryWithItems } from "@/lib/db/today";
import { EditEntrySheet } from "./EditEntrySheet";

const kcalOf = (e: FoodEntryWithItems) => e.items.reduce((s, i) => s + Number(i.kcal), 0);

export function DayFoodList({
  entries,
  photoUrls,
}: {
  entries: FoodEntryWithItems[];
  photoUrls: Record<string, string | null>;
}) {
  const t = useTranslations("food");
  const tm = useTranslations("meals");
  const [editing, setEditing] = useState<FoodEntryWithItems | null>(null);

  if (!entries.length)
    return <p className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>;

  return (
    <>
      {MEAL_ORDER.map((meal) => {
        const list = entries.filter((e) => e.meal_type === meal);
        if (!list.length) return null;
        return (
          <section key={meal} className="rounded-3xl bg-card p-4">
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="font-heading font-semibold">{tm(meal)}</h2>
              <span className="num text-sm text-muted-foreground">{Math.round(list.reduce((s, e) => s + kcalOf(e), 0))} kcal</span>
            </div>
            <ul className="divide-y divide-border">
              {list.map((e) => {
                const photo = e.photos[0] && photoUrls[e.photos[0].storage_path];
                return (
                  <li key={e.id} id={e.id}>
                    <button onClick={() => setEditing(e)} className="flex w-full items-center gap-3 py-3 text-left">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                          {e.source === "ai" ? <Sparkles className="size-4 text-primary" /> : <Zap className="size-4 text-carbs" />}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{e.items.map((i) => i.name).join(", ")}</span>
                        <span className="num block text-xs text-muted-foreground">
                          {Math.round(e.items.reduce((s, i) => s + Number(i.protein_g), 0))}P ·{" "}
                          {Math.round(e.items.reduce((s, i) => s + Number(i.carbs_g), 0))}C ·{" "}
                          {Math.round(e.items.reduce((s, i) => s + Number(i.fat_g), 0))}F
                        </span>
                      </span>
                      <span className="num shrink-0 font-semibold">{Math.round(kcalOf(e))}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}
