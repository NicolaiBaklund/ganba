import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { sumItems, type FoodEntryWithItems, type MealType } from "@/lib/db/today";
import { ListRow } from "@/components/tasuki/ListRow";

/** The day in order: snacks before dinner (the Food tab keeps its own order). */
const DAY_ORDER: MealType[] = ["breakfast", "lunch", "snack", "dinner", "evening"];
/** Main meals get a slot even before they are logged; snacks show once there are some. */
const SLOTS = new Set<MealType>(["breakfast", "lunch", "dinner"]);

/**
 * The day's meals as one list under a rule: meal, what was in it, kcal (tap opens the day on Food). A main meal not
 * logged yet is a grey slot with a + that logs straight into it.
 */
export async function MealsList({ entries, date, today }: { entries: FoodEntryWithItems[]; date: string; today: string }) {
  const tm = await getTranslations("meals");

  return (
    <section className="mt-6 border-t-2 border-foreground">
      {DAY_ORDER.map((meal) => {
        const list = entries.filter((e) => e.meal_type === meal);
        if (!list.length) {
          if (!SLOTS.has(meal)) return null;
          return (
            <ListRow
              key={meal}
              href={`/food/log?mode=text&meal=${meal}${date === today ? "" : `&date=${date}`}`}
              title={<span className="text-muted-foreground">{tm(meal)}</span>}
              trailing={
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full border border-border">
                  <Plus className="size-4" />
                </span>
              }
            />
          );
        }
        const items = list.flatMap((e) => e.items);
        return (
          <ListRow
            key={meal}
            href={`/food?date=${date}#${list[0]!.id}`}
            title={tm(meal)}
            sub={items.map((i) => i.name).join(", ")}
            value={Math.round(sumItems(items).kcal)}
          />
        );
      })}
    </section>
  );
}
