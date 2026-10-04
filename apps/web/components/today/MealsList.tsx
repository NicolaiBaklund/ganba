import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MEAL_ORDER } from "@/lib/dates";
import { sumItems, type FoodEntryWithItems } from "@/lib/db/today";
import { ListRow } from "@/components/tasuki/ListRow";
import { SectionHead } from "@/components/tasuki/SectionHead";

/** The day's meals as one list: meal, what was in it, kcal. Tap opens the day on the Food tab. */
export async function MealsList({ entries, date }: { entries: FoodEntryWithItems[]; date: string }) {
  const t = await getTranslations("today");
  const tm = await getTranslations("meals");
  const add = (
    <Link href={`/food/log?mode=text&date=${date}`} className="text-[13px] font-semibold text-primary">
      {t("add")}
    </Link>
  );

  return (
    <section>
      <SectionHead title={t("meals")} action={add} />
      {!entries.length && <p className="border-b border-border py-3 text-[13px] text-muted-foreground">{t("noMeals")}</p>}
      {MEAL_ORDER.map((meal) => {
        const list = entries.filter((e) => e.meal_type === meal);
        if (!list.length) return null;
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
