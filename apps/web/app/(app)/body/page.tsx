import { getFormatter, getTranslations } from "next-intl/server";
import { forecast, localDate, trendAt, trendSeries, weeklyChange } from "@loop/core";
import { requireUser } from "@/lib/supabase/server";
import { currentRow, getProfile } from "@/lib/db/current";
import { WeightChart } from "@/components/body/WeightChart";
import { WeightList } from "@/components/body/WeightList";
import { PhotoGallery } from "@/components/body/PhotoGallery";

export default async function BodyPage() {
  const t = await getTranslations("body");
  const format = await getFormatter();
  const { supabase, user } = await requireUser();
  const profile = await getProfile(supabase, user.id);
  const today = localDate(profile.timezone);

  const [goalRow, weightsRes, photosRes] = await Promise.all([
    currentRow(supabase, "goals", user.id, today),
    supabase
      .from("weight_entries")
      .select("id, local_date, measured_at, weight_kg, photos(id)")
      .eq("user_id", user.id)
      .order("measured_at", { ascending: false }),
    supabase
      .from("photos")
      .select("id, storage_path, weight_entries(local_date)")
      .eq("user_id", user.id)
      .eq("bucket", "body")
      .order("created_at", { ascending: false }),
  ]);

  const weights = weightsRes.data ?? [];
  const trend = trendSeries(
    weights.map((w) => ({ localDate: w.local_date, measuredAt: w.measured_at, weightKg: Number(w.weight_kg) })),
  );
  const goalKg = Number(goalRow?.target_weight_kg ?? 0);
  const fc = forecast(trend, today, goalKg);
  const current = trendAt(trend, today);
  const change = weeklyChange(trend, today);

  const photoRows = photosRes.data ?? [];
  const signed = photoRows.length
    ? (await supabase.storage.from("body").createSignedUrls(photoRows.map((p) => p.storage_path), 3600)).data ?? []
    : [];
  const photos = photoRows.flatMap((p, i) => {
    const url = signed[i]?.signedUrl;
    const date = (p.weight_entries as unknown as { local_date: string } | null)?.local_date;
    return url && date ? [{ id: p.id, url, date }] : [];
  });

  return (
    <main className="flex flex-col gap-4 px-4 pt-4">
      <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>

      <section className="grid grid-cols-3 gap-2">
        <Stat label={t("trend")} value={current?.toFixed(1) ?? "–"} unit="kg" />
        <Stat label={t("perWeek")} value={change == null ? "–" : `${change > 0 ? "+" : ""}${change.toFixed(1)}`} unit="kg" />
        <Stat label={t("goal")} value={goalKg ? String(goalKg) : "–"} unit="kg" />
      </section>
      {fc.etaDate && (
        <p className="-mt-2 text-sm text-muted-foreground">
          {t("eta", { date: format.dateTime(new Date(`${fc.etaDate}T00:00:00Z`), { day: "numeric", month: "long", year: "numeric" }) })}
        </p>
      )}

      <section className="rounded-3xl bg-card p-4">
        <WeightChart trend={trend} goalKg={goalKg} today={today} etaDate={fc.etaDate} />
      </section>

      <h2 className="mt-2 font-heading text-lg font-semibold">{t("photos")}</h2>
      <PhotoGallery photos={photos} />

      <h2 className="mt-2 font-heading text-lg font-semibold">{t("history")}</h2>
      <WeightList
        rows={weights.slice(0, 60).map((w) => ({
          id: w.id,
          local_date: w.local_date,
          weight_kg: Number(w.weight_kg),
          photoCount: (w.photos as unknown as { id: string }[] | null)?.length ?? 0,
        }))}
      />
    </main>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-2xl bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="num mt-1 text-xl font-bold">
        {value}
        <span className="ml-0.5 text-xs font-medium text-muted-foreground">{unit}</span>
      </p>
    </div>
  );
}
