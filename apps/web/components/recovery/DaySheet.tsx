"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { ISODate } from "@loop/core";
import { BottomSheet } from "@/components/common/BottomSheet";
import { ListRow } from "@/components/tasuki/ListRow";
import { SectionHead } from "@/components/tasuki/SectionHead";
import type { RecoveryDay } from "@/lib/recovery/day";

const PHASES = [
  { key: "deep", field: "deepS", color: "var(--w-long)" },
  { key: "light", field: "lightS", color: "var(--w-easy)" },
  { key: "rem", field: "remS", color: "var(--w-tempo)" },
  { key: "awake", field: "awakeS", color: "var(--border)" },
] as const;
const hm = (s: number | null) => (s == null ? "–" : `${Math.floor(s / 3600)}:${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`);

export function DaySheet({ date, onClose, whySlot }: { date: ISODate | null; onClose: () => void; whySlot?: (date: ISODate) => React.ReactNode }) {
  const t = useTranslations("recovery");
  const format = useFormatter();
  const [day, setDay] = useState<RecoveryDay | null>(null);
  useEffect(() => {
    setDay(null);
    if (!date) return;
    fetch(`/api/recovery/day/${date}`).then((r) => (r.ok ? r.json() : null)).then(setDay).catch(() => setDay(null));
  }, [date]);

  const title = date ? format.dateTime(new Date(`${date}T00:00:00Z`), { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }) : "";
  const n = day?.night;
  const total = n ? PHASES.reduce((s, p) => s + (n[p.field] ?? 0), 0) : 0;
  const normal = (k: "sleepScore" | "hrv" | "restingHr") =>
    day?.normal[k].low != null ? t("day.normal", { low: Math.round(day.normal[k].low!), high: Math.round(day.normal[k].high!) }) : undefined;

  return (
    <BottomSheet open={!!date} onOpenChange={(o) => !o && onClose()} title={title}>
      {!day ? (
        <div className="mt-4 h-40 animate-pulse rounded-md bg-muted" />
      ) : (
        <div className="flex flex-col pt-2">
          {n ? (
            <>
              <p className="num text-[44px] font-black leading-none [font-stretch:62%]">{hm(n.sleepS)}</p>
              <div aria-hidden className="mt-2 flex h-3 w-full gap-[2px]">
                {PHASES.map((p) => (
                  <span key={p.key} style={{ flex: n[p.field] ?? 0, background: p.color }} />
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {PHASES.filter((p) => total > 0).map((p) => `${t(`day.${p.key}`)} ${hm(n[p.field])}`).join(", ")}
              </p>
              <ListRow title={t("metric.sleepScore")} sub={normal("sleepScore")} value={n.sleepScore ?? "–"} />
              <ListRow title={t("metric.hrv")} sub={normal("hrv")} value={n.hrv != null ? `${n.hrv} ms` : "–"} />
              <ListRow title={t("metric.restingHr")} sub={normal("restingHr")} value={n.restingHr ?? "–"} />
            </>
          ) : (
            <p className="py-3 text-[13px] text-muted-foreground">{t("day.noNight")}</p>
          )}

          <SectionHead title={t("day.dayBefore")} />
          {day.before.meals === 0 ? (
            <ListRow title={t("day.nothingLogged")} />
          ) : (
            <>
              <ListRow title={t("day.kcal", { kcal: day.before.kcal, target: day.before.targetKcal })} />
              <ListRow title={t("day.carbs")} value={`${day.before.carbsG} g`} />
              <ListRow title={t("day.protein")} value={`${day.before.proteinG} g`} />
              {day.before.alcoholG > 0 && <ListRow title={t("day.alcohol")} value={`${day.before.alcoholG} g`} />}
              <ListRow title={t("day.late")} value={day.before.lateKcal == null ? t("day.lateUnknown") : `${day.before.lateKcal} kcal`} />
            </>
          )}
          <ListRow
            title={t("day.training")}
            sub={day.before.training.length ? day.before.training.map((a) => `${a.typeKey.replace(/_/g, " ")} ${a.km != null ? `${a.km} km` : `${a.minutes} min`}`).join(", ") : t("day.rest")}
          />
          {whySlot && date && <div className="mt-4">{whySlot(date)}</div>}
        </div>
      )}
    </BottomSheet>
  );
}
