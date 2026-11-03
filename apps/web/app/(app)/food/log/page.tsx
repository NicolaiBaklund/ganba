import { requireUser } from "@/lib/supabase/server";
import { getApiKeyStatus } from "@/lib/ai/keys";
import { FoodLogger } from "@/components/food/FoodLogger";
import { MEAL_ORDER } from "@/lib/dates";

export default async function FoodLogPage({ searchParams }: PageProps<"/food/log">) {
  const { mode, date, meal } = await searchParams;
  const { user } = await requireUser();
  const hasKey = !!(await getApiKeyStatus(user.id));
  const day = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  const slot = MEAL_ORDER.find((m) => m === meal);
  return <FoodLogger hasKey={hasKey} mode={mode === "photo" ? "photo" : "text"} date={day} meal={slot} />;
}
