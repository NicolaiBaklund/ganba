import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { MEAL_ORDER } from "@/lib/dates";
import { sumItems, type FoodEntryWithItems } from "@/lib/db/today";

export async function MealsList({ entries, date }: { entries: FoodEntryWithItems[]; date: string }) {
  const t = await getTranslations("today");
  const tm = await getTranslations("meals");

  if (!entries.length) {
    return (
      <section className="rounded-3xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
        {t("noMeals")}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      {MEAL_ORDER.map((meal) => {
        const list = entries.filter((e) => e.meal_type === meal);
        if (!list.length) return null;
        const total = sumItems(list.flatMap((e) => e.items)).kcal;
        return (
          <div key={meal} className="rounded-3xl bg-card p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="font-heading font-semibold">{tm(meal)}</h3>
              <span className="num text-sm text-muted-foreground">{Math.round(total)} kcal</span>
            </div>
            <ul className="flex flex-col">
              {list.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/food?date=${date}#${e.id}`}
                    className="flex items-center justify-between gap-3 py-1.5 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      {e.source === "ai" && <Sparkles className="size-3.5 shrink-0 text-primary" />}
                      <span className="truncate">{e.items.map((i) => i.name).join(", ")}</span>
                    </span>
                    <span className="num shrink-0 text-muted-foreground">{Math.round(sumItems(e.items).kcal)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
