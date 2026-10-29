import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { addDays } from "@loop/core";
import { requireUser } from "@/lib/supabase/server";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { currentFitness, todayFor } from "@/lib/training/service";
import { PlanWizard } from "@/components/training/PlanWizard";

export default async function NewPlanPage() {
  const t = await getTranslations("planWizard");
  const tt = await getTranslations("training");
  const { user } = await requireUser();
  const today = await todayFor(user.id);
  // Without Garmin and without logged runs, the wizard asks how much they run.
  const [garmin, fit] = await Promise.all([getGarminStatus(user.id), currentFitness(user.id, today)]);
  const needsStart = !garmin && fit.runCount === 0;
  return (
    <main className="flex flex-col gap-4 px-[18px] pt-4">
      <Link href="/training" className="flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="size-4" />
        {tt("title")}
      </Link>
      <h1 className="cond text-[34px] leading-none">{t("title")}</h1>
      <PlanWizard minDate={addDays(today, 7)} needsStart={needsStart} />
    </main>
  );
}
