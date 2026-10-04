import { getFormatter, getTranslations } from "next-intl/server";
import { forecast, localDate, trendAt, trendSeries, weeklyChange } from "@loop/core";
import { requireUser } from "@/lib/supabase/server";
import { currentRow, getProfile } from "@/lib/db/current";
import { WeightChart } from "@/components/body/WeightChart";
import { WeightList } from "@/components/body/WeightList";
import { PhotoGallery } from "@/components/body/PhotoGallery";
import { SectionHead } from "@/components/tasuki/SectionHead";

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

  const kgWeek = change == null ? null : `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change).toFixed(1)}`;
  const goalLine = goalKg
    ? fc.etaDate
      ? t("goalEta", { kg: goalKg, date: format.dateTime(new Date(`${fc.etaDate}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" }) })
      : t("goalOnly", { kg: goalKg })
    : null;

  return (
    <main className="flex flex-col px-[18px] pb-4 pt-5">
      <h1 className="cond text-[34px] leading-none">{t("title")}</h1>

      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="num text-[72px] font-black leading-[.9] [font-stretch:62%]">
          {current?.toFixed(1) ?? "–"}
          <span className="ml-1 text-xl font-bold text-muted-foreground [font-stretch:75%]">kg</span>
        </p>
        <p className="pb-1 text-right text-[13px] leading-normal text-muted-foreground">
          {kgWeek != null && (
            <>
              <b className="num text-base font-extrabold text-foreground">{kgWeek} kg</b> {t("perWeek").toLowerCase()}
              <br />
            </>
          )}
          {goalLine}
        </p>
      </div>

      <div className="mt-5">
        <WeightChart trend={trend} goalKg={goalKg} today={today} etaDate={fc.etaDate} />
      </div>

      <SectionHead title={t("photos")} />
      <div className="mt-3">
        <PhotoGallery photos={photos} />
      </div>

      <SectionHead title={t("history")} />
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
