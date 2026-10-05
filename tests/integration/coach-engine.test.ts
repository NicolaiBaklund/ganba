import { describe, expect, it } from "vitest";
import { buildByType, checkChanges, pacesFor, type CoachBlock, type PlanContext, type PlanWorkout, type WorkoutType } from "@loop/core";

const paces = pacesFor(45);
// Monday 5 Oct 2026; running days Tue, Thu, Sun.
const ctx: PlanContext = { weekdays: [2, 4, 0], vdot: 45, racePaceS: null, distance: "10k", today: "2026-10-05" };
const mk = (id: string, date: string, type: WorkoutType, km: number, status: PlanWorkout["status"] = "planned", week = date < "2026-10-12" ? 1 : date < "2026-10-19" ? 2 : 3): PlanWorkout => ({
  id,
  date,
  status,
  week,
  phase: "build",
  ...buildByType(type, km, "10k", 2, { paces }),
  type, // buildByType makes a plain run for "race"; the generator sets the race type
});
const plan = (): PlanWorkout[] => [
  mk("done1", "2026-10-04", "long", 13, "done"),
  mk("e1", "2026-10-06", "easy", 8),
  mk("i1", "2026-10-08", "intervals", 9),
  mk("l1", "2026-10-11", "long", 14),
  mk("e2", "2026-10-13", "easy", 8),
  mk("t2", "2026-10-15", "threshold", 9),
  mk("l2", "2026-10-18", "long", 15),
  mk("race", "2026-10-25", "race", 10),
];
const opts = { recentLongestKm: 14 };
const steps = (warmKm: number): CoachBlock[] => [
  { kind: "warmup", km: warmKm },
  { repeat: 5, steps: [{ kind: "run", km: 1, zone: "interval" }, { kind: "recover", minutes: 2 }] },
  { kind: "cooldown", km: 1.5 },
];

describe("coach engine: free edits, dry-run and warnings", () => {
  it("edit: a 1 km longer warm-up with paces from the runner's VDOT", () => {
    const a = checkChanges(plan(), [{ op: "edit", workoutId: "i1", steps: steps(2) }], ctx, opts);
    const b = checkChanges(plan(), [{ op: "edit", workoutId: "i1", steps: steps(3) }], ctx, opts);
    const wa = a.after.find((w) => w.id === "i1")!;
    const wb = b.after.find((w) => w.id === "i1")!;
    expect(Math.round((wb.plannedKm - wa.plannedKm) * 10) / 10).toBe(1);
    const warm = wb.blocks[0]!;
    expect(warm.kind === "warmup" && warm.duration).toEqual({ kind: "distance", m: 3000 });
    expect(warm.kind === "warmup" && warm.target.kind === "pace" && warm.target.minSecPerKm).toBe(paces.easy.min);
    expect(wb.title).toMatch(/Intervals/);
    expect(b.errors).toEqual([]);
  });

  it("quality the day before the long run: done, but flagged serious", () => {
    const r = checkChanges(plan(), [{ op: "move", workoutId: "i1", toDate: "2026-10-10" }], ctx, opts);
    expect(r.valid).toHaveLength(1);
    expect(r.warnings).toContainEqual({ code: "hard_back_to_back", severity: "serious", date: "2026-10-11" });
    expect(r.warnings.some((w) => w.code === "off_day" && w.date === "2026-10-10")).toBe(true); // Saturday is not a running day
  });

  it("an extra 12 km run: volume jump with numbers", () => {
    const r = checkChanges(plan(), [{ op: "add", date: "2026-10-07", type: "easy", steps: [{ kind: "run", km: 12 }] }], ctx, opts);
    const v = r.warnings.find((w) => w.code === "volume_jump")!;
    expect(v.severity).toBe("serious");
    expect(v.after! - v.before!).toBeCloseTo(12, 0);
    expect(r.after.some((w) => w.id.startsWith("new:") && w.plannedKm === 12)).toBe(true);
  });

  it("a long run far beyond recent ones is flagged", () => {
    const r = checkChanges(plan(), [{ op: "edit", workoutId: "l1", steps: [{ kind: "run", km: 25 }] }], ctx, opts);
    expect(r.warnings).toContainEqual(expect.objectContaining({ code: "long_jump", severity: "serious", after: 25 }));
  });

  it("only new warnings: a change that adds nothing risky gives none", () => {
    const r = checkChanges(plan(), [{ op: "edit", workoutId: "e1", steps: [{ kind: "run", km: 8.5 }] }], ctx, opts);
    expect(r.warnings).toEqual([]);
  });

  it("race day is for the race: nothing can be moved or added onto it", () => {
    const r = checkChanges(
      plan(),
      [
        { op: "move", workoutId: "e2", toDate: "2026-10-25" },
        { op: "add", date: "2026-10-25", type: "easy", steps: [{ kind: "run", km: 4 }] },
      ],
      ctx,
      opts,
    );
    expect(r.valid).toEqual([]);
    expect(r.errors.map((e) => e.reason)).toEqual(["race day is for the race", "race day is for the race"]);
  });

  it("warnings fire again when an already risky thing gets worse", () => {
    // Recent longest 10 km: the 14 km long run is already over 130 %; making it 20 km is worse.
    const r = checkChanges(plan(), [{ op: "edit", workoutId: "l1", steps: [{ kind: "run", km: 20 }] }], ctx, { recentLongestKm: 10 });
    expect(r.warnings).toContainEqual(expect.objectContaining({ code: "long_jump", after: 20 }));
  });

  it("hard days already done this week count toward 'many hard days'", () => {
    // Monday's intervals are done; threshold Wed and tempo Fri planned: 3 hard days. Today's easy → intervals makes 4,
    // which only shows if the done day counts.
    const list = [
      mk("d1", "2026-10-05", "intervals", 9, "done"),
      mk("d2", "2026-10-06", "easy", 6),
      mk("d3", "2026-10-07", "threshold", 9),
      mk("d4", "2026-10-09", "tempo", 9),
      mk("d5", "2026-10-11", "easy", 8),
    ];
    const r = checkChanges(list, [{ op: "replace", workoutId: "d2", type: "intervals", km: 9 }], { ...ctx, today: "2026-10-06" }, opts);
    expect(r.warnings.some((w) => w.code === "many_hard")).toBe(true);
  });

  it("an added session belongs to the week it lands in", () => {
    const r = checkChanges(plan(), [{ op: "add", date: "2026-10-12", type: "easy", steps: [{ kind: "run", km: 5 }] }], ctx, opts);
    expect(r.after.find((w) => w.id.startsWith("new:"))!.week).toBe(2);
  });

  it("stops only what makes no sense", () => {
    const r = checkChanges(
      plan(),
      [
        { op: "edit", workoutId: "race", steps: [{ kind: "run", km: 10 }] },
        { op: "drop", workoutId: "done1" },
        { op: "edit", workoutId: "e2", steps: [{ kind: "run", km: 0.5 }] },
        { op: "add", date: "2026-10-09", type: "easy", steps: [{ kind: "run", km: 70 }] },
        { op: "add", date: "2027-02-01", type: "easy", steps: [{ kind: "run", km: 5 }] },
        { op: "edit", workoutId: "t2", steps: [{ repeat: 40, steps: [{ kind: "run", km: 0.2 }] }] },
        { op: "edit", workoutId: "e1", steps: [{ kind: "run", km: 6 }, { repeat: 0, steps: [{ kind: "run", km: 1 }] }] },
        { op: "edit", workoutId: "l2", steps: [{ kind: "run", km: 12 }, { repeat: 3, steps: [] }] },
      ],
      ctx,
      opts,
    );
    expect(r.valid).toEqual([]);
    expect(r.errors.map((e) => e.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
