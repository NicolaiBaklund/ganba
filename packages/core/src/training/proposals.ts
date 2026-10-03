import { addDays, daysBetween, weekday, type ISODate } from "../dates";
import { mondayOf } from "./generate";
import { pacesFor } from "./vdot";
import { buildByType, measure, repaceBlocks, rescaleBlocks, type BuildContext } from "./workouts";
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
    const w = byId.get(c.workoutId);
    if (!w) continue;
    if (c.op === "move") {
      w.date = c.toDate;
      w.status = "planned";
    } else if (c.op === "drop") {
      w.status = "removed";
    } else if (c.op === "replace") {
      const b = buildByType(c.type, c.km, ctx.distance ?? "10k", 2, build());
      Object.assign(w, { type: b.type, title: b.title, blocks: b.blocks, plannedKm: b.plannedKm, plannedDurationS: b.plannedDurationS });
    }
    changed.add(w.id);
  }
  return { workouts: list, changedIds: changed, vdot };
}

export interface Rejected {
  change: ProposalChange;
  reason: string;
}

/**
 * Guard rails for changes not made by the engine itself (AI suggestions):
 * only future planned sessions, allowed days (unless the user named a day), no back-to-back
 * hard days, volume increase ≤ 10 % per week, small pace changes.
 */
export function validateChanges(
  all: PlanWorkout[],
  changes: ProposalChange[],
  ctx: PlanContext,
  opts: { allowAnyDay: boolean },
): { valid: ProposalChange[]; rejected: Rejected[] } {
  const valid: ProposalChange[] = [];
  const rejected: Rejected[] = [];
  let state = all;
  const weekKm = (list: PlanWorkout[], monday: ISODate) =>
    list.filter((w) => active(w) && w.status !== "missed" && mondayOf(w.date) === monday).reduce((s, w) => s + w.plannedKm, 0);

  for (const c of changes) {
    const reject = (reason: string) => rejected.push({ change: c, reason });
    if (c.op === "repace") {
      if (Math.abs(c.vdot - ctx.vdot) > 3) {
        reject("pace change too large");
        continue;
      }
    } else if (c.op === "rescale") {
      if (c.factor < 0.5 || c.factor > 1.1) {
        reject("volume change out of range");
        continue;
      }
      if (c.fromDate < ctx.today) {
        reject("cannot change the past");
        continue;
      }
    } else {
      const w = state.find((x) => x.id === c.workoutId);
      if (!w || w.status === "removed" || w.status === "done" || w.date < ctx.today && c.op !== "move") {
        reject("not a future planned session");
        continue;
      }
      if (w.type === "race") {
        reject("race day cannot be changed");
        continue;
      }
      if (c.op === "move") {
        if (c.toDate < ctx.today || daysBetween(ctx.today, c.toDate) > 60) {
          reject("date out of range");
          continue;
        }
        if (!opts.allowAnyDay && !ctx.weekdays.includes(weekday(c.toDate))) {
          reject("not one of your running days");
          continue;
        }
        if (isHard(w) && hardNeighbour(state, c.toDate, w.id)) {
          reject("would put two hard days in a row");
          continue;
        }
      }
      if (c.op === "replace") {
        if (c.type === "race" || c.km < 2 || c.km > 45) {
          reject("invalid session");
          continue;
        }
        if (HARD_TYPES.has(c.type) && hardNeighbour(state, w.date, w.id)) {
          reject("would put two hard days in a row");
          continue;
        }
      }
    }
    const next = applyChanges(state, [c], ctx).workouts;
    const mondays = new Set(next.filter((w) => w.date >= ctx.today).map((w) => mondayOf(w.date)));
    const grows = [...mondays].some((m) => weekKm(next, m) > weekKm(state, m) * 1.1 + 0.5 && weekKm(next, m) > weekKm(all, m) * 1.1 + 0.5);
    if (grows) {
      reject("adds more than 10 % to a week");
      continue;
    }
    valid.push(c);
    state = next;
  }
  return { valid, rejected };
}
