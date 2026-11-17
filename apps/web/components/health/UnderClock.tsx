"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatPace, type RaceDistance, type Tone, type WorkoutType } from "@loop/core";
import type { SpotVerdict, SpotView, SpotWeek } from "@/lib/health/spot";
import type { ChallengeView } from "@/lib/health/challenge";
import type { DailyNote } from "@/lib/health/note";
import { fmtClock } from "@/lib/training/format";
import { Sash } from "@/components/tasuki/Sash";
import { GARMIN_SYNCED } from "@/components/common/GarminSync";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useTranslations>;

const TONE: Record<Tone, string> = { good: "text-success", warn: "text-warning", bad: "text-destructive", plain: "text-foreground" };
const SASH_TYPES = new Set(["easy", "long", "intervals", "threshold", "tempo", "strides", "race", "test"]);
const MINUS = "−";
const day = (d: string, weekday: "short" | "long" = "short") => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday, timeZone: "UTC" });
const dayMonth = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const signed = (s: number) => `${s < 0 ? MINUS : "+"}${fmtClock(Math.abs(s))}`;
const DIST_KM: [number, RaceDistance][] = [[5, "5k"], [10, "10k"], [21.1, "half"], [42.2, "marathon"]];
const distOf = (km: number) => DIST_KM.find(([k]) => Math.abs(k - km) <= k * 0.05)?.[1] ?? null;

/** The challenge as one sentence ("Beat 20:36 in the 5K test"). */
export function challengeText(t: T, c: Pick<ChallengeView, "kind" | "params">): string {
  const p = c.params;
  switch (c.kind) {
    case "test_beat": {
      const d = distOf(p.km!);
      return t("spot.challenge.test_beat", { time: fmtClock(p.targetS!), dist: d ? t(`spot.dist.${d}`) : `${p.km} km` });
    }
    case "reps_in_zone":
      return t("spot.challenge.reps_in_zone", { min: formatPace(p.min!), max: formatPace(p.max!) });
    case "finish_fast":
      return t("spot.challenge.finish_fast", { km: p.km!, pace: formatPace(p.maxSecPerKm!) });
    case "long_hr":
    case "easy_hr_week":
      return t(`spot.challenge.${c.kind}`, { bpm: p.bpm! });
    default:
      return t("spot.challenge.last_rep_fastest");
  }
}

const resultValue = (kind: ChallengeView["kind"], v: number) => (kind === "test_beat" ? fmtClock(v) : kind === "long_hr" || kind === "easy_hr_week" ? `${v} bpm` : formatPace(v));

function ResultPill({ t, kind, result, value }: { t: T; kind: ChallengeView["kind"]; result: "won" | "lost"; value: number }) {
  return (
    <span
      aria-label={t(result === "won" ? "spot.won" : "spot.lost")}
      className={cn("num rounded-full px-2.5 py-0.5 text-[12px] font-bold text-background", result === "won" ? "bg-success" : "bg-destructive")}
    >
      {result === "won" ? "✓" : "✗"} {resultValue(kind, value)}
    </span>
  );
}

function verdictLines(t: T, v: SpotVerdict): string[] {
  const out: string[] = [];
  if (v.reps?.length) {
    const zone = v.zone ? `${formatPace(v.zone.min)}–${formatPace(v.zone.max)}` : "–";
    const paces = v.reps.map((r) => formatPace(r.secPerKm));
    if (v.reps.length > 4) {
      const sorted = [...v.reps].map((r) => r.secPerKm).sort((a, b) => a - b);
      out.push(t("spot.repsMany", { n: v.reps.length, from: formatPace(sorted[0]!), to: formatPace(sorted.at(-1)!), zone }));
    } else {
      const list = paces.length > 1 ? t("spot.and", { a: paces.slice(0, -1).join(", "), b: paces.at(-1)! }) : paces[0]!;
      out.push(t("spot.reps", { paces: list, zone }));
      const hrs = v.reps.map((r) => r.hr).filter((h): h is number => h != null);
      if (hrs.length === v.reps.length) out.push(t("spot.repsHr", { hrs: hrs.length > 1 ? t("spot.and", { a: hrs.slice(0, -1).join(", "), b: String(hrs.at(-1)) }) : String(hrs[0]) }));
    }
    if (v.repsDone != null && v.repsPlanned != null && v.repsDone < v.repsPlanned) out.push(t("spot.repsOf", { done: v.repsDone, planned: v.repsPlanned }));
  } else if (v.easy) {
    out.push(v.easy.hr != null ? t("spot.easy", { pace: formatPace(v.easy.secPerKm), hr: v.easy.hr }) : t("spot.easyNoHr", { pace: formatPace(v.easy.secPerKm) }));
    const d = v.easy.hrVsNormal;
    if (d != null) out.push(Math.abs(d) <= 2 ? t("spot.normal") : d > 0 ? t("spot.aboveNormal", { n: d }) : t("spot.belowNormal", { n: -d }));
  }
  if (v.secondHalfDeltaS != null) out.push(t(v.secondHalfDeltaS < 0 ? "spot.secondFaster" : "spot.secondSlower", { s: Math.abs(v.secondHalfDeltaS) }));
  return out;
}

function ghostText(t: T, g: NonNullable<SpotVerdict["ghost"]>): { lead: string; delta: string } {
  const lead = t("spot.ghost", { km: g.km, date: dayMonth(g.date), pace: formatPace(g.secPerKm), hr: g.hr });
  if (Math.abs(g.deltaS) <= 5 && g.deltaHr <= -3) return { lead, delta: t("spot.samePaceLower", { hr: -g.deltaHr }) };
  const hr = g.deltaHr === 0 ? t("spot.sameHr") : g.deltaHr < 0 ? t("spot.bpmLower", { n: -g.deltaHr }) : t("spot.bpmHigher", { n: g.deltaHr });
  return { lead, delta: t("spot.paceHr", { s: Math.abs(g.deltaS), dir: t(g.deltaS <= 0 ? "spot.faster" : "spot.slower"), hr }) };
}

function GhostIcon() {
  return (
    <svg width="16" height="18" viewBox="0 0 18 20" aria-hidden className="mt-0.5 shrink-0 text-muted-foreground">
      <path d="M9 1C4.6 1 2 4.3 2 8.5V19l2.4-1.8L6.7 19 9 17.2 11.3 19l2.3-1.8L16 19V8.5C16 4.3 13.4 1 9 1Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6.5" cy="8.5" r="1.2" fill="currentColor" />
      <circle cx="11.5" cy="8.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function VerdictBlock({ t, v }: { t: T; v: SpotVerdict }) {
  const type = v.type && SASH_TYPES.has(v.type) ? (v.type as WorkoutType) : "easy";
  const headline = v.test
    ? t("spot.inTime", { dist: distOf(v.test.km) ? t(`spot.dist.${distOf(v.test.km)!}`) : `${v.test.km} km`, time: fmtClock(v.test.timeS) })
    : v.race
      ? t("spot.inTime", { dist: distOf(v.race.km) ? t(`spot.dist.${distOf(v.race.km)!}`) : `${v.race.km} km`, time: fmtClock(v.race.timeS) })
      : v.word
        ? t(`spot.word.${v.word}`)
        : null;
  const lines = verdictLines(t, v);
  if (v.race?.deltaS) lines.push(t(v.race.deltaS < 0 ? "spot.raceFaster" : "spot.raceSlower", { time: fmtClock(Math.abs(v.race.deltaS)) }));
  const ghost = v.ghost && ghostText(t, v.ghost);
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Sash type={type} className="h-[6px] w-4" />
        {v.title ?? t("spot.run")}, {day(v.date)}
      </p>
      {(headline || v.challenge) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {headline && <p className={cn("cond text-[30px] leading-none", TONE[v.tone])}>{headline}</p>}
          {v.challenge && <ResultPill t={t} kind={v.challenge.kind} result={v.challenge.result} value={v.challenge.value} />}
        </div>
      )}
      {lines.length > 0 && <p className="num text-[15px] leading-snug [font-stretch:100%]">{lines.join(" ")}</p>}
      {v.test?.proposal && <p className="text-[15px] font-semibold text-primary">{t("spot.newPaces")}</p>}
      {ghost && (
        <p className="flex gap-2.5 border-t border-border pt-2.5 text-[14px] text-muted-foreground">
          <GhostIcon />
          <span>
            {ghost.lead} <span className="font-semibold text-foreground">{ghost.delta}</span>
          </span>
        </p>
      )}
    </div>
  );
}

function WeekBlock({ t, w }: { t: T; w: SpotWeek }) {
  const now = w.weeks.at(-1)!;
  const dist = t(`spot.dist.${w.distance}`);
  const max = Math.max(...w.weeks.map((x) => Math.abs(x.deltaS)), 1);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted-foreground">{t("spot.weekSub", { runs: w.runs, km: w.km })}</p>
      <p className={cn("cond text-[30px] leading-none", now.deltaS < 0 ? "text-success" : "text-foreground")}>
        {now.deltaS === 0 ? t("spot.weekSame", { dist }) : t("spot.week", { delta: signed(now.deltaS), dist })}
      </p>
      <div className="mt-1 flex h-16 items-end gap-1.5" role="img" aria-label={t("spot.weekBars")}>
        {w.weeks.map((x, i) => (
          <div key={x.sunday} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span
              className={cn("block w-full rounded-sm", i === w.weeks.length - 1 && x.deltaS < 0 ? "bg-success" : "bg-border")}
              style={{ height: `${Math.max(3, (Math.abs(x.deltaS) / max) * 44)}px` }}
            />
            <span className="num text-[11px] text-muted-foreground">{x.deltaS === 0 ? "0:00" : signed(x.deltaS)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChallengeBlock({ t, c }: { t: T; c: ChallengeView }) {
  const sub = c.kind === "easy_hr_week" ? t("spot.allWeek") : c.kind === "test_beat" ? `${day(c.workoutDate!, "long")}. ${t("spot.garminEstimate")}` : t("spot.when", { day: day(c.workoutDate!, "long"), title: c.workoutTitle ?? "" });
  return (
    <div className="flex flex-col gap-2">
      <span className="w-fit rounded-full border border-warning px-2.5 py-0.5 text-[12px] font-bold text-warning">{t("spot.thisWeek")}</span>
      <p className="cond text-[30px] leading-none">{challengeText(t, c)}</p>
      <p className="text-[15px]">{sub}</p>
    </div>
  );
}

function AlertBlock({ note, onDone }: { note: DailyNote; onDone: (keep: boolean) => void }) {
  const t = useTranslations("health");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function act(keep: boolean) {
    setBusy(true);
    const res = await fetch("/api/health/swap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keep }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(t("error"));
    onDone(keep);
    if (!keep) {
      toast.success(t("swapped"));
      router.refresh();
    }
  }
  return (
    <div>
      <p className="text-[17px] font-[450] leading-[1.4] [font-stretch:100%]">{note.text}</p>
      <p className="mt-2 text-[13px] font-semibold text-warning">{t("coach")}</p>
      <div className="mt-4 flex items-center gap-5">
        {note.swap && (
          <button type="button" disabled={busy} onClick={() => act(false)} className="h-12 rounded-full bg-foreground px-5 text-[15px] font-bold text-background disabled:opacity-60">
            {t("swap", { km: note.swap.km })}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => act(true)} className="h-12 px-1 text-[15px] font-semibold text-muted-foreground disabled:opacity-60">
          {t(note.swap ? "keep" : "gotIt")}
        </button>
      </div>
    </div>
  );
}

/**
 * The place under the race clock (spec 2026-11-18 §4): an alert, else the verdict on the last run (with its ghost),
 * else what the week bought, else this week's challenge; the open challenge as a line under the others. Nothing at
 * all when there is nothing new.
 */
export function UnderClock() {
  const t = useTranslations("health");
  // undefined while loading.
  const [spot, setSpot] = useState<SpotView | null | undefined>(undefined);

  useEffect(() => {
    const ctrl = new AbortController();
    const load = () =>
      fetch("/api/health/spot", { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<SpotView>) : Promise.reject(new Error(String(r.status)))))
        .then(setSpot)
        .catch((e) => e?.name !== "AbortError" && setSpot(null));
    void load();
    // A run synced on open: ask again when the sync has finished.
    window.addEventListener(GARMIN_SYNCED, load);
    return () => {
      ctrl.abort();
      window.removeEventListener(GARMIN_SYNCED, load);
    };
  }, []);

  if (spot === undefined) {
    return (
      <section className="mt-7 space-y-2" aria-busy="true">
        <div className="h-5 w-full rounded bg-muted" />
        <div className="h-5 w-4/5 rounded bg-muted" />
      </section>
    );
  }
  if (!spot?.main) return null;
  const onAlertDone = () => setSpot((s) => (s ? { ...s, alert: null, main: s.verdict ? "verdict" : s.week ? "week" : s.challenge ? "challenge" : null } : s));
  return (
    <section className="mt-7 border-t border-border pt-4">
      {spot.main === "alert" && spot.alert && <AlertBlock note={spot.alert} onDone={onAlertDone} />}
      {spot.main === "verdict" && spot.verdict && <VerdictBlock t={t} v={spot.verdict} />}
      {spot.main === "week" && spot.week && <WeekBlock t={t} w={spot.week} />}
      {spot.main === "challenge" && spot.challenge && <ChallengeBlock t={t} c={spot.challenge} />}
      {spot.challengeLine && spot.challenge && (
        <p className="mt-3 text-[13px] text-muted-foreground">{t("spot.line", { text: challengeText(t, spot.challenge) })}</p>
      )}
    </section>
  );
}
