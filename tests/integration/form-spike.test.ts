import { describe, expect, it } from "vitest";
import { addDays, formSelfCheck, formSeries, localDate, recoveryRunForm } from "@loop/core";
import { loadRecoveryDays } from "@/lib/recovery/load";
import { computeRecovery } from "@/lib/recovery/compute";
import { admin } from "./setup";

const corr = (xs: number[], ys: number[]) => {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
};

/** Manual: SPIKE_EMAIL=<account> pnpm exec vitest run tests/integration/form-spike.test.ts — Form on real data (read-only unless SPIKE_WRITE=1). */
describe.skipIf(!process.env.SPIKE_EMAIL)("spike: Form on real data", () => {
  it("prints Form per day, spread and how it lines up with run form", async () => {
    const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
    const user = data.users.find((u) => u.email === process.env.SPIKE_EMAIL)!;
    expect(user).toBeTruthy();
    const { data: profile } = await admin().from("profiles").select("timezone").eq("user_id", user.id).single();
    const today = localDate(profile?.timezone ?? "UTC");
    const days = await loadRecoveryDays(user.id, today);
    const series = formSeries(days, addDays(today, -89), today, () => ({ findings: [], hardPlanned: false }));
    for (const [d, r] of series) console.log(d, String(r.score).padStart(3), r.parts.map((p) => `${p.id}:${p.status === "ok" ? p.points : "-"}`).join(" "));
    const scores = [...series.values()].map((r) => r.score);
    console.log("n", scores.length, "min", Math.min(...scores), "max", Math.max(...scores), "mean", Math.round(scores.reduce((s, x) => s + x, 0) / scores.length));
    const rf = recoveryRunForm(days);
    const pairs = [...rf].filter(([d]) => series.has(d));
    console.log("runs with Form", pairs.length, "corr", corr(pairs.map(([d]) => series.get(d)!.score), pairs.map(([, v]) => v)).toFixed(2));
    for (const id of ["hrv", "sleep", "rhr", "sleepDebt", "load", "energy"]) {
      const ps = pairs.filter(([d]) => series.get(d)!.parts.find((p) => p.id === id)?.status === "ok");
      if (ps.length > 5) console.log(id, ps.length, corr(ps.map(([d]) => series.get(d)!.parts.find((p) => p.id === id)!.points), ps.map(([, v]) => v)).toFixed(2));
    }
    console.log("self-check", formSelfCheck(new Map([...series].map(([d, r]) => [d, r.score])), rf));
    // SPIKE_WRITE=1: run the real computation (what a sync does) so the screens have Form to show.
    if (process.env.SPIKE_WRITE) console.log("compute", await computeRecovery(user.id, today, { force: true }));
  }, 120_000);
});
