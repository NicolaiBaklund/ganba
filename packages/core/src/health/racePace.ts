import type { ISODate } from "../dates";
import type { Block, Step } from "../training/types";
import { judgedPace, runSteps, type RunLap } from "./laps";

/** Laps that count as race pace (spec 2026-11-18 §9). */
export const RACE_PACE = { minLapM: 400, slackS: 3 } as const;

const raceStep = (s: Step) => s.target.kind === "pace" && s.target.zone === "race";

/**
 * Race-pace km run since the plan started against race-pace km planned before race day. Only for a plan with a race
 * day ahead (or today) and at least some race pace planned before it; the race's own zone is the pace.
 */
export function racePaceAccount(i: {
  workouts: readonly { date: ISODate; type: string; status: string; blocks: readonly Block[] }[];
  runs: readonly { date: ISODate; laps: readonly RunLap[] }[];
  today: ISODate;
  planStart: ISODate;
}): { secPerKm: number; doneKm: number; plannedKm: number } | null {
  const live = i.workouts.filter((w) => w.status !== "removed");
  const race = live.filter((w) => w.type === "race" && w.date >= i.today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const zoneStep = race && runSteps(race.blocks).find(raceStep);
  if (!race || !zoneStep || zoneStep.target.kind !== "pace") return null;
  const { minSecPerKm: min, maxSecPerKm: max } = zoneStep.target;
  const mid = (min + max) / 2;
  let planned = 0;
  for (const w of live.filter((x) => x.date < race.date && x.type !== "race")) {
    for (const s of runSteps(w.blocks).filter(raceStep)) planned += s.duration.kind === "distance" ? s.duration.m / 1000 : s.duration.kind === "time" ? s.duration.s / mid : 0;
  }
  if (planned <= 0) return null;
  let done = 0;
  for (const r of i.runs.filter((x) => x.date >= i.planStart && x.date <= i.today)) {
    for (const l of r.laps) {
      const p = judgedPace(l);
      if (l.distanceM >= RACE_PACE.minLapM && p >= min - RACE_PACE.slackS && p <= max + RACE_PACE.slackS) done += l.distanceM / 1000;
    }
  }
  return { secPerKm: Math.round(mid), doneKm: Math.round(done * 10) / 10, plannedKm: Math.round(planned * 10) / 10 };
}
