import { addDays, daysBetween } from "../dates";
import { benjaminiHochberg, blockPermutationP, groupMeanDiff, dependenceFactor, hashString, mean, mulberry32, sd } from "./stats";
import { needsTrainingControl, RECOVERY_QUESTIONS, type RecoveryQuestion } from "./questions";
import { RECOVERY_OUTCOMES, type RecoveryFactor, type RecoveryOutcome, type RecoveryRow } from "./variables";

export const RECOVERY_RULES = {
  minPerGroup: 8,
  minEffectSd: 0.4,
  maxQ: 0.1,
  controlMinPerGroup: 5,
  controlEffectSd: 0.25,
  noEffectMinPerGroup: 20,
  noEffectMaxSd: 0.2,
  permutations: 2000,
  blockDays: 14,
  minDrinkDays: 4,
  seed: 20261004,
} as const;

export interface RecoveryGroup {
  n: number;
  mean: number | null;
  /** Tertiles: the factor's cut (low ≤ bound, high ≥ bound). Binary: null. */
  bound: number | null;
}

export interface RecoveryResult {
  questionId: string;
  factor: RecoveryFactor;
  outcome: RecoveryOutcome;
  lag: number;
  kind: "finding" | "no_effect" | "needs_data";
  reason: "few_days" | "unclear" | "training" | null;
  /** needed = days per group required, raised when neighbouring days depend on each other. */
  groups: { high: RecoveryGroup; low: RecoveryGroup; needed: number };
  /** (high − low) / SD of the detrended outcome; signed. */
  effectSd: number | null;
  pValue: number | null;
  qValue: number | null;
  controlOk: boolean | null;
  /** 1 = strongest finding. */
  rank: number | null;
}

interface Split {
  labels: number[];
  low: number | null;
  high: number | null;
}

function split(values: number[], transform: RecoveryQuestion["transform"]): Split | null {
  if (transform === "binary") return { labels: values.map((v) => (v === 1 ? 1 : -1)), low: null, high: null };
  const s = [...values].sort((a, b) => a - b);
  const k = Math.floor(s.length / 3);
  if (k < 1) return null;
  let low = s[k - 1]!;
  let high = s[s.length - k]!;
  if (!(low < high)) {
    // Few distinct values (e.g. days since a hard day): both cuts on the same value. Move one cut to
    // the neighbouring value, whichever leaves the smaller group bigger.
    const below = s.filter((v) => v < low).at(-1);
    const above = s.find((v) => v > high);
    const minGroup = (lo: number, hi: number) => Math.min(s.filter((v) => v <= lo).length, s.filter((v) => v >= hi).length);
    const a = below != null ? minGroup(below, high) : -1;
    const b = above != null ? minGroup(low, above) : -1;
    if (a < 1 && b < 1) return null;
    if (a >= b) low = below!;
    else high = above!;
  }
  return { labels: values.map((v) => (v <= low ? -1 : v >= high ? 1 : 0)), low, high };
}

const groupOf = (labels: number[], ys: number[], which: 1 | -1, bound: number | null): RecoveryGroup => {
  const v = ys.filter((_, i) => labels[i] === which);
  return { n: v.length, mean: v.length ? mean(v) : null, bound };
};

/** Runs every question on the rows (spec §5.4–§5.6). Deterministic. */
export function analyzeRecovery(rows: readonly RecoveryRow[], questions: readonly RecoveryQuestion[] = RECOVERY_QUESTIONS, opts: { maxQ?: number } = {}): RecoveryResult[] {
  const R = RECOVERY_RULES;
  const maxQ = opts.maxQ ?? R.maxQ;
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const first = rows[0]?.date;
  const drinkDays = rows.filter((r) => r.factors.alcohol === 1).length;
  const asked = questions.filter((q) => q.factor !== "alcohol" || drinkDays >= R.minDrinkDays);
  const spreadOf = new Map(RECOVERY_OUTCOMES.map((o) => [o, sd(rows.flatMap((r) => (r.outcomes[o] == null ? [] : [r.outcomes[o]!])))]));

  const tested = asked.map((q) => {
    const pairs = rows.flatMap((r) => {
      const x = r.factors[q.factor];
      const y = byDate.get(addDays(r.date, q.lag))?.outcomes[q.outcome];
      return x == null || y == null ? [] : [{ row: r, x, y }];
    });
    const s = split(pairs.map((p) => p.x), q.transform);
    const ys = pairs.map((p) => p.y);
    const high: RecoveryGroup = s ? groupOf(s.labels, ys, 1, s.high) : { n: 0, mean: null, bound: null };
    const low: RecoveryGroup = s ? groupOf(s.labels, ys, -1, s.low) : { n: 0, mean: null, bound: null };
    const spread = spreadOf.get(q.outcome)!;
    const effect = s && high.n && low.n && spread > 0 ? groupMeanDiff(s.labels, ys) / spread : null;
    // Streaky factor and outcome carry less information per day: require 8 *effective* days per group,
    // n_eff = n / k (Bartlett). Long streaks are beyond what shuffling blocks can absorb on their own.
    const dayOf = (d: string) => daysBetween(first!, d);
    // Measured on the outcome as is (conservative: an outcome that follows a patterned factor also counts).
    const k = dependenceFactor(
      new Map(pairs.map((pp) => [dayOf(pp.row.date), pp.x])),
      new Map(pairs.map((pp) => [dayOf(pp.row.date), pp.y])),
      R.blockDays,
    );
    const needed = Math.ceil(R.minPerGroup * k);
    const enough = !!s && high.n >= needed && low.n >= needed && effect != null;
    const p = enough
      ? blockPermutationP(
          s!.labels,
          ys,
          pairs.map((pp) => Math.floor(daysBetween(first!, pp.row.date) / R.blockDays)),
          R.permutations,
          mulberry32(R.seed ^ hashString(q.id)),
        )
      : null;
    return { q, pairs, s, ys, high, low, spread, effect, enough, needed, p };
  });

  const withP = tested.filter((t) => t.p != null);
  const qs = benjaminiHochberg(withP.map((t) => t.p!));
  const qOf = new Map(withP.map((t, i) => [t.q.id, qs[i]!]));

  const results: RecoveryResult[] = tested.map((t) => {
    const qv = qOf.get(t.q.id) ?? null;
    let kind: RecoveryResult["kind"] = "needs_data";
    let reason: RecoveryResult["reason"] = "unclear";
    let controlOk: boolean | null = null;
    if (!t.enough) {
      reason = "few_days";
    } else if (Math.abs(t.effect!) >= R.minEffectSd && qv! <= maxQ) {
      if (needsTrainingControl(t.q)) {
        const labels = t.s!.labels.map((l, i) => (t.pairs[i]!.row.factors.hard === 1 || t.pairs[i]!.row.factors.long === 1 ? 0 : l));
        const nh = labels.filter((l) => l === 1).length;
        const nl = labels.filter((l) => l === -1).length;
        const ce = nh >= R.controlMinPerGroup && nl >= R.controlMinPerGroup ? groupMeanDiff(labels, t.ys) / t.spread : null;
        controlOk = ce != null && Math.sign(ce) === Math.sign(t.effect!) && Math.abs(ce) >= R.controlEffectSd;
        // Too few days left without training also means the link cannot be told apart from training.
        if (controlOk) [kind, reason] = ["finding", null];
        else reason = "training";
      } else {
        [kind, reason] = ["finding", null];
      }
    } else if (Math.min(t.high.n, t.low.n) >= R.noEffectMinPerGroup && Math.abs(t.effect!) < R.noEffectMaxSd) {
      [kind, reason] = ["no_effect", null];
    }
    return {
      questionId: t.q.id,
      factor: t.q.factor,
      outcome: t.q.outcome,
      lag: t.q.lag,
      kind,
      reason,
      groups: { high: t.high, low: t.low, needed: t.needed },
      effectSd: t.effect,
      pValue: t.p,
      qValue: qv,
      controlOk,
      rank: null,
    };
  });

  results
    .filter((r) => r.kind === "finding")
    .sort((a, b) => Math.abs(b.effectSd!) - Math.abs(a.effectSd!) || a.qValue! - b.qValue!)
    .forEach((r, i) => (r.rank = i + 1));
  return results;
}
