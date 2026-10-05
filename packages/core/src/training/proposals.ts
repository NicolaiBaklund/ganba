import { addDays, weekday, type ISODate } from "../dates";
import { mondayOf } from "./generate";
import { pacesFor, vo2AtSpeed } from "./vdot";
import { blocksFromSteps, buildByType, defaultTitle, measure, repaceBlocks, rescaleBlocks, resizeQuality, type BuildContext } from "./workouts";
import { HARD_TYPES, KEY_TYPES, type PlanWorkout, type ProposalChange, type RaceDistance, type WorkoutType } from "./types";

export interface PlanContext {
  weekdays: number[];
  vdot: number;
  racePaceS: number | null;
  distance: RaceDistance | null;
  today: ISODate;
}

export interface Proposal {
  kind: "missed" | "paces" | "volume";
  summary: string;
  changes: ProposalChange[];
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LABEL: Record<WorkoutType, string> = {
  easy: "easy run",
  long: "long run",
  intervals: "intervals",
  threshold: "threshold run",
  tempo: "marathon-pace run",
  strides: "strides run",
  race: "race",
};

const active = (w: PlanWorkout) => w.status !== "removed";
const isHard = (w: PlanWorkout) => HARD_TYPES.has(w.type);

/** Would a hard session on `date` sit next to another hard session? */
function hardNeighbour(all: PlanWorkout[], date: ISODate, exceptId: string): boolean {
  const near = new Set([addDays(date, -1), addDays(date, 1)]);
  return all.some((w) => w.id !== exceptId && active(w) && w.status !== "missed" && isHard(w) && near.has(w.date));
}

/**
 * Missed key sessions this week → move to a free allowed day later this week
 * (or onto an easy day, dropping that easy run), else drop them.
 * `alreadyProposed` = workout ids that already have a proposal.
 */
export function missedProposal(all: PlanWorkout[], ctx: PlanContext, alreadyProposed: Set<string>): Proposal | null {
  const weekEnd = addDays(mondayOf(ctx.today), 6);
  const missed = all.filter(
    (w) => w.status === "missed" && KEY_TYPES.has(w.type) && mondayOf(w.date) === mondayOf(ctx.today) && !alreadyProposed.has(w.id),
  );
  if (!missed.length) return null;

  const changes: ProposalChange[] = [];
  const lines: string[] = [];
  const taken = new Set<ISODate>();
  for (const m of missed) {
    let target: ISODate | null = null;
    let swapWith: PlanWorkout | null = null;
    for (let d = ctx.today; d <= weekEnd; d = addDays(d, 1)) {
      if (!ctx.weekdays.includes(weekday(d)) || taken.has(d) || hardNeighbour(all, d, m.id)) continue;
      const onDay = all.filter((w) => active(w) && w.date === d && w.status !== "missed");
      if (onDay.length === 0) {
        target = d;
        break;
      }
      if (!swapWith && onDay.every((w) => w.type === "easy" && w.status === "planned")) {
        target ??= d;
        swapWith = onDay[0]!;
      }
    }
    if (target) {
      taken.add(target);
      changes.push({ op: "move", workoutId: m.id, toDate: target });
      if (swapWith && swapWith.date === target) changes.push({ op: "drop", workoutId: swapWith.id });
      lines.push(`Move ${DAY[weekday(m.date)]}'s ${LABEL[m.type]} to ${DAY[weekday(target)]}${swapWith && swapWith.date === target ? " (replaces the easy run)" : ""}.`);
    } else {
      changes.push({ op: "drop", workoutId: m.id });
      lines.push(`No room this week for ${DAY[weekday(m.date)]}'s ${LABEL[m.type]}. Skip it.`);
    }
  }
  return { kind: "missed", summary: lines.join(" "), changes };
}

/** Faster recent runs than the plan assumes → offer quicker paces. Only upward: easy-only weeks say nothing about a drop. */
export function pacesProposal(planVdot: number, fitnessVdot: number): Proposal | null {
  if (fitnessVdot < planVdot + 1) return null;
  const v = Math.round(fitnessVdot * 10) / 10;
  return {
    kind: "paces",
    summary: `Your recent runs show better fitness (VDOT ${v}, plan uses ${planVdot}). Update your paces?`,
    changes: [{ op: "repace", vdot: v }],
  };
}

/** One completed quality session: the planned pace of its hard parts vs. how fast those laps were run. */
export interface QualityResult {
  date: ISODate;
  zone: "interval" | "threshold" | "marathon";
  plannedSecPerKm: number;
  actualSecPerKm: number;
}

/** Share of VO2max each zone is run at (Daniels). */
const ZONE_FRACTION = { interval: 0.975, threshold: 0.88, marathon: 0.8 } as const;
export const SLOWER_THRESHOLD = 1.03;
const SLOWER_SESSIONS = 2;
const SLOWER_WINDOW_DAYS = 21;
const MAX_VDOT_DROP = 3;

/**
 * Paces down only on clear evidence: the last two or three hard sessions (21 days) were all run
 * > 3 % slower than planned. The new VDOT is what those laps actually show, at most 3 lower.
 * Easy runs never count: they say nothing about fitness.
 */
export function slowerPacesProposal(planVdot: number, results: QualityResult[], today: ISODate): Proposal | null {
  const recent = results
    .filter((r) => r.date >= addDays(today, -SLOWER_WINDOW_DAYS) && r.date <= today && r.actualSecPerKm > 0 && r.plannedSecPerKm > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 3);
  if (recent.length < SLOWER_SESSIONS) return null;
  const ratios = recent.map((r) => r.actualSecPerKm / r.plannedSecPerKm);
  if (ratios.some((x) => x < SLOWER_THRESHOLD)) return null;
  const shown = recent.map((r) => vo2AtSpeed(60_000 / r.actualSecPerKm) / ZONE_FRACTION[r.zone]);
  const mean = shown.reduce((a, b) => a + b, 0) / shown.length;
  const v = Math.round(Math.max(planVdot - MAX_VDOT_DROP, Math.min(mean, planVdot - 0.5)) * 10) / 10;
  if (v >= planVdot) return null;
  const pct = Math.round(((ratios.reduce((a, b) => a + b, 0) / ratios.length) - 1) * 100);
  return {
    kind: "paces",
    summary: `Your last ${recent.length} hard sessions ran about ${pct} % slower than planned. Ease your paces a little (VDOT ${planVdot} → ${v})?`,
    changes: [{ op: "repace", vdot: v }],
  };
}

/** Under 70 % of planned km two weeks running → scale the rest down. */
export function volumeProposal(all: PlanWorkout[], ctx: PlanContext): Proposal | null {
  const thisMonday = mondayOf(ctx.today);
  const ratios: number[] = [];
  for (const back of [1, 2]) {
    const start = addDays(thisMonday, -7 * back);
    const end = addDays(start, 6);
    const inWeek = all.filter((w) => active(w) && w.date >= start && w.date <= end);
    const planned = inWeek.reduce((s, w) => s + w.plannedKm, 0);
    if (planned <= 0) return null;
    const done = inWeek.filter((w) => w.status === "done").reduce((s, w) => s + (w.activityKm ?? w.plannedKm), 0);
    ratios.push(done / planned);
  }
  if (ratios.some((r) => r >= 0.7)) return null;
  const avg = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  const factor = Math.round(Math.min(0.9, Math.max(0.6, avg + 0.1)) * 100) / 100;
  return {
    kind: "volume",
    summary: `You ran about ${Math.round(avg * 100)} % of the plan the last two weeks. Scale the coming weeks to ${Math.round(factor * 100)} %?`,
    changes: [{ op: "rescale", fromDate: ctx.today, factor }],
  };
}

export interface ApplyResult {
  workouts: PlanWorkout[];
  changedIds: Set<string>;
  vdot: number;
}

/** Applies changes to copies of the workouts. Only future, planned (or missed, for moves) sessions change. */
export function applyChanges(all: PlanWorkout[], changes: ProposalChange[], ctx: PlanContext): ApplyResult {
  const list = all.map((w) => ({ ...w }));
  const byId = new Map(list.map((w) => [w.id, w]));
  const changed = new Set<string>();
  let vdot = ctx.vdot;
  const build = (): BuildContext => ({ paces: pacesFor(vdot), racePaceS: ctx.racePaceS ?? undefined });

  for (const c of changes) {
    if (c.op === "repace") {
      vdot = c.vdot;
      for (const w of list)
        if (w.status === "planned" && w.date >= ctx.today) {
          w.blocks = repaceBlocks(w.blocks, build().paces, ctx.racePaceS ?? undefined);
          const m = measure(w.blocks, build().paces);
          w.plannedDurationS = m.s;
          changed.add(w.id);
        }
      continue;
    }
    if (c.op === "rescale") {
      for (const w of list)
        if (w.status === "planned" && w.date >= c.fromDate && (w.type === "easy" || w.type === "long" || w.type === "strides")) {
          w.blocks = rescaleBlocks(w.blocks, c.factor);
          const m = measure(w.blocks, build().paces);
          w.plannedKm = m.km;
          w.plannedDurationS = m.s;
          w.title = w.title.replace(/\d+(\.\d+)? km/, `${m.km} km`);
          changed.add(w.id);
        }
      continue;
    }
    if (c.op === "add") {
      const blocks = blocksFromSteps(c.steps, build());
      const m = measure(blocks, build().paces);
      const near = [...list].filter((x) => x.date <= c.date).sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1) ?? list[0];
      const nw: PlanWorkout = {
        id: `new:${changed.size}:${c.date}`,
        date: c.date,
        type: c.type,
        title: c.title?.trim() || defaultTitle(c.type, m.km),
        blocks,
        plannedKm: m.km,
        plannedDurationS: m.s,
        week: near?.week ?? 1,
        phase: near?.phase ?? "build",
        status: "planned",
      };
      list.push(nw);
      byId.set(nw.id, nw);
      changed.add(nw.id);
      continue;
    }
    const w = byId.get(c.workoutId);
    if (!w) continue;
    if (c.op === "move") {
      w.date = c.toDate;
      w.status = "planned";
    } else if (c.op === "drop") {
      w.status = "removed";
    } else if (c.op === "replace") {
      const sameQuality = c.type === w.type && (c.type === "intervals" || c.type === "threshold" || c.type === "tempo");
      if (sameQuality) {
        // Same session, different size: keep the reps, change the easy cool-down.
        w.blocks = resizeQuality(w.blocks, c.km - w.plannedKm, build().paces);
        const m = measure(w.blocks, build().paces);
        w.plannedKm = m.km;
        w.plannedDurationS = m.s;
      } else {
        const b = buildByType(c.type, c.km, ctx.distance ?? "10k", 2, build());
        Object.assign(w, { type: b.type, title: b.title, blocks: b.blocks, plannedKm: b.plannedKm, plannedDurationS: b.plannedDurationS });
      }
    } else if (c.op === "edit") {
      const blocks = blocksFromSteps(c.steps, build());
      const m = measure(blocks, build().paces);
      const type = c.type ?? w.type;
      Object.assign(w, { type, title: c.title?.trim() || defaultTitle(type, m.km), blocks, plannedKm: m.km, plannedDurationS: m.s });
    }
    changed.add(w.id);
  }
  return { workouts: list, changedIds: changed, vdot };
}

