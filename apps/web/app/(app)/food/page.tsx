import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { getDaySnapshot } from "@/lib/db/today";
import { DateNav } from "@/components/today/DateNav";
import { DayFoodList } from "@/components/food/DayFoodList";

export default async function FoodPage({ searchParams }: PageProps<"/food">) {
  const { date } = await searchParams;
  const t = await getTranslations("food");
  const { supabase, user } = await requireUser();
  const snap = await getDaySnapshot(supabase, user.id, typeof date === "string" ? date : undefined);

  const paths = snap.entries.flatMap((e) => e.photos.map((p) => p.storage_path));
  const signed = paths.length ? ((await supabase.storage.from("food").createSignedUrls(paths, 3600)).data ?? []) : [];
  const urls = Object.fromEntries(paths.map((p, i) => [p, signed[i]?.signedUrl ?? null]));

  const pct = (v: number, max: number) => (max > 0 ? Math.round((v / max) * 100) : 0);

  return (
    <main className="flex flex-col gap-3 px-4">
      <DateNav date={snap.date} today={snap.today} basePath="/food" />
      <section className="grid grid-cols-4 gap-2 text-center">
        <Total label="kcal" value={snap.intake.kcal} target={snap.macrosTarget.kcal} color="text-primary" />
        <Total label={t("protein")} value={snap.intake.proteinG} target={snap.macrosTarget.proteinG} color="text-protein" />
        <Total label={t("carbs")} value={snap.intake.carbsG} target={snap.macrosTarget.carbsG} color="text-carbs" />
        <Total label={t("fat")} value={snap.intake.fatG} target={snap.macrosTarget.fatG} color="text-fat" />
      </section>
      <p className="text-center text-xs text-muted-foreground">
        {t("ofTarget", { pct: pct(snap.intake.kcal, snap.macrosTarget.kcal) })}
      </p>
      <DayFoodList entries={snap.entries} photoUrls={urls} />
    </main>
  );
}

function Total({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return (
    <div className="rounded-2xl bg-card px-2 py-3">
      <p className={`num text-lg font-bold ${color}`}>{Math.round(value)}</p>
      <p className="num text-[11px] text-muted-foreground">/ {Math.round(target)}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
