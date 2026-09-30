import { requireUser } from "@/lib/supabase/server";
import { getApiKeyStatus } from "@/lib/ai/keys";
import { FoodLogger } from "@/components/food/FoodLogger";

export default async function FoodLogPage({ searchParams }: PageProps<"/food/log">) {
  const { mode, date } = await searchParams;
  const { user } = await requireUser();
  const hasKey = !!(await getApiKeyStatus(user.id));
  const day = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  return <FoodLogger hasKey={hasKey} mode={mode === "photo" ? "photo" : "text"} date={day} />;
}
