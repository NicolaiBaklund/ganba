import { requireUser } from "@/lib/supabase/server";
import { getApiKeyStatus } from "@/lib/ai/keys";
import { FoodLogger } from "@/components/food/FoodLogger";

export default async function FoodLogPage({ searchParams }: PageProps<"/food/log">) {
  const { mode } = await searchParams;
  const { user } = await requireUser();
  const hasKey = !!(await getApiKeyStatus(user.id));
  return <FoodLogger hasKey={hasKey} mode={mode === "photo" ? "photo" : "text"} />;
}
