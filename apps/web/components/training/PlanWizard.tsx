"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/common/Chip";
import { fmtClock, parseClock, typeColor } from "@/lib/training/format";
import type { WorkoutType } from "@loop/core";

type Distance = "5k" | "10k" | "half" | "marathon";
type GoalChoice = Distance | "build";

const DISTANCES: Distance[] = ["5k", "10k", "half", "marathon"];
const RACE_M: Record<Distance, number> = { "5k": 5000, "10k": 10000, half: 21097.5, marathon: 42195 };
const WEEK = [1, 2, 3, 4, 5, 6, 0];

interface Preview {
  fitness: {
    vdot: number;
    kmPerWeek: number;
    sparse: boolean;
    experienced: boolean;
    didQuality: boolean;
    source:
      | { kind: "run"; date: string; distanceKm: number }
      | { kind: "laps"; date: string }
      | { kind: "garmin"; time10kS: number }
      | { kind: "default" }
      | { kind: "manual" };
  };
  weeks: { week: number; phase: string; km: number }[];
  peakKm: number;
  predictedTimeS: number | null;
  racePaceS: number | null;
  firstWeek: { date: string; type: WorkoutType; title: string; km: number }[];
}

export function PlanWizard({ minDate }: { minDate: string }) {
  const t = useTranslations("planWizard");
  const tt = useTranslations("training");
  const tw = useTranslations("weekdays");
  const format = useFormatter();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<GoalChoice>("10k");
  const [raceDate, setRaceDate] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [days, setDays] = useState<number[]>([2, 4, 0]);
  const [runs, setRuns] = useState(3);
  const [longDay, setLongDay] = useState(0);
  const [recentDist, setRecentDist] = useState<Distance | null>(null);
  const [recentTime, setRecentTime] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const isRace = goal !== "build";
  const targetS = targetTime.trim() ? parseClock(targetTime) : null;
  const recentS = recentTime.trim() ? parseClock(recentTime) : null;
  const goalValid = !isRace || (raceDate >= minDate && (targetTime.trim() === "" || targetS != null));
  const daysValid = days.length >= 2 && runs <= days.length && days.includes(longDay);

  const body = () => ({
    goal: isRace ? { kind: "race", distance: goal, raceDate, targetTimeS: targetS } : { kind: "build" },
    weekdays: days,
    longRunWeekday: longDay,
    runsPerWeek: runs,
    recentRace: recentDist && recentS ? { distanceM: RACE_M[recentDist], timeS: recentS } : null,
  });

  function toggleDay(d: number) {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    setDays(next);
    if (runs > next.length) setRuns(Math.max(2, next.length));
    if (!next.includes(longDay) && next.length) setLongDay(next.includes(0) ? 0 : next.includes(6) ? 6 : next[next.length - 1]!);
  }

  async function post(url: string) {
    setBusy(true);
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body()) }).catch(() => null);
    setBusy(false);
    const json = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      const key = ["invalid_race_date", "garmin_required"].includes(json?.error) ? json.error : "generic";
      toast.error(t(`errors.${key}`));
      return null;
    }
    return json;
  }

  async function toPreview() {
    const p = await post("/api/training/plan/preview");
    if (p) {
      setPreview(p);
      setStep(2);
    }
  }

  async function create() {
    if (await post("/api/training/plan")) {
      router.replace("/training");
      router.refresh();
    }
  }

  const maxKm = Math.max(1, ...(preview?.weeks.map((w) => w.km) ?? [1]));
  const day = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { day: "numeric", month: "short" });
  const sourceText = (s: Preview["fitness"]["source"]) =>
    s.kind === "run"
      ? t("source.run", { km: s.distanceKm, date: day(s.date) })
      : s.kind === "laps"
        ? t("source.laps", { date: day(s.date) })
        : s.kind === "garmin"
          ? t("source.garmin", { time: fmtClock(s.time10kS) })
          : t(`source.${s.kind}`);

  return (
    <div className="flex flex-col gap-4">
      {step === 0 && (
        <section className="flex flex-col gap-4 rounded-3xl bg-card p-5">
          <h2 className="font-heading text-lg font-semibold">{t("goalTitle")}</h2>
          <div className="flex flex-wrap gap-2">
            {DISTANCES.map((d) => (
              <Chip key={d} selected={goal === d} onClick={() => setGoal(d)}>
                {tt(`distance.${d}`)}
              </Chip>
            ))}
            <Chip selected={goal === "build"} onClick={() => setGoal("build")}>
              {t("build")}
            </Chip>
          </div>
          {isRace ? (
            <>
              <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                {t("raceDate")}
                <input
                  type="date"
                  min={minDate}
                  value={raceDate}
                  onChange={(e) => setRaceDate(e.target.value)}
                  className="h-14 rounded-xl border border-border bg-muted px-4 text-base text-foreground outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                {t("targetTime")}
                <input
                  inputMode="numeric"
                  placeholder="0:50:00"
                  value={targetTime}
                  onChange={(e) => setTargetTime(e.target.value)}
                  className="num h-14 rounded-xl border border-border bg-muted px-4 text-base text-foreground outline-none focus:border-primary"
                />
                <span className="text-xs">{t("targetTimeHint")}</span>
              </label>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("buildHint")}</p>
          )}
          <Button className="h-12 rounded-xl" disabled={!goalValid} onClick={() => setStep(1)}>
            {t("next")}
          </Button>
        </section>
      )}

      {step === 1 && (
        <section className="flex flex-col gap-4 rounded-3xl bg-card p-5">
          <h2 className="font-heading text-lg font-semibold">{t("daysTitle")}</h2>
          <div>
            <p className="mb-2 text-sm text-muted-foreground">{t("days")}</p>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEK.map((d) => (
                <Chip key={d} selected={days.includes(d)} onClick={() => toggleDay(d)} className="h-11 px-0 text-xs">
                  {tw(String(d))}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm text-muted-foreground">{t("runs")}</p>
            <div className="flex flex-wrap gap-2">
              {[2, 3, 4, 5, 6].map((n) => (
                <Chip key={n} selected={runs === n} disabled={n > days.length} onClick={() => setRuns(n)} className="w-12 px-0">
                  <span className="num">{n}</span>
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm text-muted-foreground">{t("longDay")}</p>
            <div className="flex flex-wrap gap-2">
              {WEEK.filter((d) => days.includes(d)).map((d) => (
                <Chip key={d} selected={longDay === d} onClick={() => setLongDay(d)} className="px-3">
                  {tw(String(d))}
                </Chip>
              ))}
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium">{t("recentTitle")}</p>
            <p className="mb-2 text-xs text-muted-foreground">{t("recentHint")}</p>
            <div className="flex flex-wrap gap-2">
              {DISTANCES.map((d) => (
                <Chip key={d} selected={recentDist === d} onClick={() => setRecentDist(recentDist === d ? null : d)} className="px-3">
                  {tt(`distance.${d}`)}
                </Chip>
              ))}
            </div>
            {recentDist && (
              <input
                inputMode="numeric"
                placeholder={t("recentTime")}
                value={recentTime}
                onChange={(e) => setRecentTime(e.target.value)}
                className="num mt-2 h-12 w-full rounded-xl border border-border bg-muted px-4 outline-none focus:border-primary"
              />
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="h-12 flex-1 rounded-xl" onClick={() => setStep(0)}>
              {t("back")}
            </Button>
            <Button className="h-12 flex-1 rounded-xl" disabled={!daysValid || busy || (!!recentDist && recentS == null)} onClick={toPreview}>
              {t("next")}
            </Button>
          </div>
        </section>
      )}

      {step === 2 && preview && (
        <section className="flex flex-col gap-4 rounded-3xl bg-card p-5">
          <h2 className="font-heading text-lg font-semibold">{t("previewTitle")}</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">{tt("vdot")}</p>
              <p className="num text-xl font-semibold">{preview.fitness.vdot}</p>
              <p className="text-xs text-muted-foreground">{t("kmPerWeek", { km: preview.fitness.kmPerWeek })}</p>
            </div>
            {preview.predictedTimeS != null && (
              <div>
                <p className="text-muted-foreground">{targetS ? tt("target") : tt("predicted")}</p>
                <p className="num text-xl font-semibold">{fmtClock(targetS ?? preview.predictedTimeS)}</p>
              </div>
            )}
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{sourceText(preview.fitness.source)}</p>
          {preview.fitness.sparse && <p className="text-xs text-warning">{t("sparse")}</p>}
          {preview.fitness.experienced && (
            <p className="text-xs text-success">
              {t("experienced")}
              {preview.fitness.didQuality && ` ${t("didQuality")}`}
            </p>
          )}
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>{t("weeks", { n: preview.weeks.length })}</span>
              <span>{t("peak", { km: preview.peakKm })}</span>
            </div>
            <div className="flex h-20 items-end gap-0.5">
              {preview.weeks.map((w) => (
                <div
                  key={w.week}
                  title={`${w.km} km`}
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${Math.max(4, (w.km / maxKm) * 100)}%`,
                    background: w.phase === "taper" ? "var(--w-race)" : w.phase === "recovery" ? "var(--muted)" : "var(--primary)",
                  }}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">{t("firstWeek")}</p>
            {preview.firstWeek.map((w) => (
              <div key={w.date + w.title} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="w-16 text-muted-foreground">
                  {format.dateTime(new Date(`${w.date}T00:00:00Z`), { weekday: "short", day: "numeric" })}
                </span>
                <span className="h-4 w-1 rounded-full" style={{ background: typeColor(w.type) }} />
                <span className="flex-1 truncate">{w.title}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="h-12 flex-1 rounded-xl" onClick={() => setStep(1)}>
              {t("back")}
            </Button>
            <Button className="h-12 flex-1 rounded-xl" disabled={busy} onClick={create}>
              {busy ? t("creating") : t("create")}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
