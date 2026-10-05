import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";

export default async function RecoveryPage() {
  await requireUser();
  const t = await getTranslations("recovery");
  return (
    <main className="flex flex-col px-[18px] pb-4 pt-5">
      <h1 className="cond text-[34px] leading-none">{t("title")}</h1>
    </main>
  );
}
