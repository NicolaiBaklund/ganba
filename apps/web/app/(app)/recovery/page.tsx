import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { loadRecoveryView } from "@/lib/recovery/view";
import { RECOVERY_HISTORY_DAYS } from "@/lib/recovery/fetch";
import { RecoveryScreen } from "@/components/recovery/RecoveryScreen";
import { WeeklySummary } from "@/components/recovery/WeeklySummary";
import { AiOff } from "@/components/recovery/AiOff";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function RecoveryPage() {
  const { user } = await requireUser();
  const t = await getTranslations("recovery");
  const v = await loadRecoveryView(user.id);

  if (v.garmin === "none") {
    return (
      <main className="flex flex-col px-[18px] pt-5">
        <h1 className="cond text-[34px] leading-none">{t("title")}</h1>
        <p className="mt-6 text-[15px]">{t("noGarmin")}</p>
        <Link href="/profile#garmin" className={cn(buttonVariants(), "mt-4 h-12 self-start px-5")}>
          {t("connect")}
        </Link>
      </main>
    );
  }
  return (
    <main className="flex flex-col px-[18px] pb-4 pt-5">
      <h1 className="cond text-[34px] leading-none">{t("title")}</h1>
      {v.historyDays < RECOVERY_HISTORY_DAYS && <p className="mt-2 text-[13px] text-muted-foreground">{t("fetching", { days: v.historyDays })}</p>}
      {!v.consent && <AiOff />}
      <RecoveryScreen view={v} more={v.consent ? <WeeklySummary /> : null} ai={v.consent} />
    </main>
  );
}
