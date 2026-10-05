import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function AiOff() {
  const t = await getTranslations("recovery.ai");
  return (
    <Link href="/profile#ai" className="mt-3 self-start text-[13px] font-semibold text-muted-foreground underline underline-offset-2">
      {t("off")}
    </Link>
  );
}
