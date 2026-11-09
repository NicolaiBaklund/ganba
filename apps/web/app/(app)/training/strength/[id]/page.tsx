import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronLeft, Watch } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { loadSession } from "@/lib/strength/view";
import { SessionEditor } from "@/components/strength/SessionEditor";

/** A strength session (spec 2026-11-10 §6): the exercises with their sets, Add exercise, Finish. */
export default async function StrengthPage({ params }: PageProps<"/training/strength/[id]">) {
  const { id } = await params;
  const { user } = await requireUser();
  const [view, t, tt, format] = await Promise.all([loadSession(user.id, id), getTranslations("strength"), getTranslations("training"), getFormatter()]);
  if (!view) notFound();
  const date = format.dateTime(new Date(`${view.date}T00:00:00Z`), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <main className="flex flex-col px-[18px] pb-8 pt-5">
      <Link href="/training" className="-ml-1 flex items-center gap-1 self-start text-sm text-muted-foreground">
        <ChevronLeft className="size-4" />
        {tt("title")}
      </Link>
      <h1 className="cond mt-2 text-[34px] leading-none">{t("title")}</h1>
      <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        {view.watch && <Watch className="size-3.5" />}
        {view.watch
          ? view.watch.kcal != null
            ? t("watchLineKcal", { date, min: view.watch.minutes, kcal: view.watch.kcal })
            : t("watchLine", { date, min: view.watch.minutes })
          : date}
      </p>
      <SessionEditor view={view} />
    </main>
  );
}
