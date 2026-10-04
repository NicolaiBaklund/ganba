/** Small seeded PRNG: the same seed gives the same permutations, so results never flicker. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

export function sd(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
}

/** Labels: 1 = high/yes group, -1 = low/no group, 0 = not compared. */
export function groupMeanDiff(labels: readonly number[], ys: readonly number[]): number {
  let sh = 0;
  let nh = 0;
  let sl = 0;
  let nl = 0;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === 1) {
      sh += ys[i]!;
      nh++;
    } else if (labels[i] === -1) {
      sl += ys[i]!;
      nl++;
    }
  }
  return nh && nl ? sh / nh - sl / nl : 0;
}

/**
 * Two-sided p-value for the group difference. Labels are shuffled in whole blocks (calendar weeks),
 * not day by day, because neighbouring days depend on each other (HRV runs in streaks, big deficits
 * come in weeks); a day-by-day shuffle would find too many false links.
 */
export function blockPermutationP(
  labels: readonly number[],
  ys: readonly number[],
  blockOf: readonly number[],
  permutations: number,
  rng: () => number,
): number {
  const observed = Math.abs(groupMeanDiff(labels, ys));
  const byBlock = new Map<number, number[]>();
  labels.forEach((l, i) => {
    const b = byBlock.get(blockOf[i]!);
    if (b) b.push(l);
    else byBlock.set(blockOf[i]!, [l]);
  });
  const blocks = [...byBlock.values()];
  let hits = 0;
  for (let p = 0; p < permutations; p++) {
    for (let i = blocks.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
    }
    if (Math.abs(groupMeanDiff(blocks.flat(), ys)) >= observed - 1e-12) hits++;
  }
  return (hits + 1) / (permutations + 1);
}

/** Benjamini–Hochberg adjusted p-values (q), in input order. */
export function benjaminiHochberg(ps: readonly number[]): number[] {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const q = new Array<number>(m);
  let min = 1;
  for (let r = m - 1; r >= 0; r--) {
    const [p, i] = order[r]!;
    min = Math.min(min, (p * m) / (r + 1));
    q[i] = min;
  }
  return q;
}
