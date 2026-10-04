"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Zap } from "lucide-react";
import { MEAL_ORDER } from "@/lib/dates";
import type { FoodEntryWithItems } from "@/lib/db/today";
import { SectionHead } from "@/components/tasuki/SectionHead";
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

  if (!entries.length) return <p className="mt-6 border-b border-border py-3 text-[13px] text-muted-foreground">{t("empty")}</p>;

  const sum = (e: FoodEntryWithItems, k: "protein_g" | "carbs_g" | "fat_g") => Math.round(e.items.reduce((s, i) => s + Number(i[k]), 0));
  return (
    <>
      {MEAL_ORDER.map((meal) => {
        const list = entries.filter((e) => e.meal_type === meal);
        if (!list.length) return null;
        return (
          <section key={meal}>
            <SectionHead title={tm(meal)}>{Math.round(list.reduce((s, e) => s + kcalOf(e), 0))} kcal</SectionHead>
            <ul>
              {list.map((e) => {
                const photo = e.photos[0] && photoUrls[e.photos[0].storage_path];
                return (
                  <li key={e.id} id={e.id}>
                    <button onClick={() => setEditing(e)} className="flex w-full items-center gap-3 border-b border-border py-3 text-left active:bg-muted/60">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt="" className="size-11 shrink-0 rounded-sm object-cover" />
                      ) : (
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-card text-muted-foreground">
                          {e.source === "ai" ? <Sparkles className="size-4 text-primary" /> : <Zap className="size-4 text-carbs-ink" />}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{e.items.map((i) => i.name).join(", ")}</span>
                        <span className="num block text-[13px] text-muted-foreground">
                          {sum(e, "protein_g")}P {sum(e, "carbs_g")}C {sum(e, "fat_g")}F
                        </span>
                      </span>
                      <span className="num shrink-0 text-[17px] font-extrabold">{Math.round(kcalOf(e))}</span>
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
