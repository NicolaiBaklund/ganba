import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { getApiKeyStatus } from "@/lib/ai/keys";
import { ApiKeyCard } from "@/components/profile/ApiKeyCard";

export default async function ProfilePage() {
  const t = await getTranslations("profile");
  const { user } = await requireUser();
  const keyStatus = await getApiKeyStatus(user.id);

  return (
    <main className="flex flex-col gap-4 px-4 pt-4">
      <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
      <ApiKeyCard status={keyStatus} />
    </main>
  );
}
