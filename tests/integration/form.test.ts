import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, computeForm, FORM_RULES, formSelfCheck, weekBalance, type FormFinding, type ISODate, type RecoveryDayInput } from "@loop/core";
import { encryptSecret } from "@/lib/ai/crypto";
import type { RecoveryAi } from "@/lib/ai/recovery";
import { saveTokens } from "@/lib/garmin/accounts";
import { computeRecovery } from "@/lib/recovery/compute";
import { setAiHealthConsent } from "@/lib/recovery/consent";
import { formNote } from "@/lib/recovery/form-note";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";

const D: ISODate = "2026-09-30";
/** An ordinary day: everything at the person's normal, so every part scores 0. */
const day = (date: ISODate, o: Partial<RecoveryDayInput> = {}): RecoveryDayInput => ({
  date,
  sleepScore: 70,
  hrv: 60,
  restingHr: 50,
  food: null,
  hard: false,
  long: false,
  steps: 8000,
  easyMetersPerBeat: null,
  qualityPaceRatio: null,
  sleepS: 28800,
  sleepNeedS: 28800,
  hrvLow: 50,
  hrvHigh: 70,
  load: 50,
  ...o,
});
const history = (n: number, edit: (d: RecoveryDayInput, i: number) => Partial<RecoveryDayInput> = () => ({})) =>
  Array.from({ length: n }, (_, i) => {
    const d = day(addDays(D, -(n - 1 - i)));
    return { ...d, ...edit(d, n - 1 - i) };
  });
const none = { findings: [], hardPlanned: false };
const part = (r: ReturnType<typeof computeForm>, id: string) => r!.parts.find((p) => p.id === id);
const food = (deficitKcal: number, carbsPerKg = 4) => ({ deficitKcal, carbsPerKg, proteinPerKg: 1.6, alcoholG: 0, lateKcal: 0 });

describe("Form engine", () => {
  it("an ordinary day is 50, steady, every part 0", () => {
    const r = computeForm(history(40), D, none)!;
    expect(r.score).toBe(50);
    expect(r.band).toBe("steady");
    for (const id of ["hrv", "sleep", "rhr", "sleepDebt", "load"]) expect(part(r, id)).toMatchObject({ status: "ok", points: 0 });
    expect(part(r, "energy")!.status).toBe("missing"); // no food logged: counts 0, never a penalty
    expect(part(r, "carbs")).toBeUndefined(); // only with a hard session planned
  });

  it("no night (no sleep score, no HRV) → no Form", () => {
    expect(computeForm(history(40, (_, back) => (back === 0 ? { sleepScore: null, hrv: null } : {})), D, none)).toBeNull();
    expect(computeForm(history(40), addDays(D, 1), none)).toBeNull(); // no row at all
  });

  it("extremes stay inside each cap and inside 0–100", () => {
    const bad = computeForm(
      history(40, (_, back) =>
        back === 0
          ? { hrv: 1, sleepScore: 5, restingHr: 95 }
          : back <= 3
            ? { food: food(3000), sleepS: 0, load: 900 }
            : back <= 6
              ? { sleepS: 0, load: 900 }
              : {},
      ),
      D,
      none,
    )!;
    expect(bad.score).toBe(0);
    expect(part(bad, "hrv")!.points).toBe(-FORM_RULES.hrvMax);
    expect(part(bad, "sleep")!.points).toBe(-FORM_RULES.sleepMax);
    expect(part(bad, "rhr")!.points).toBe(-FORM_RULES.rhrMax);
    expect(part(bad, "sleepDebt")!.points).toBe(-FORM_RULES.debtMinus);
    expect(part(bad, "load")!.points).toBe(-FORM_RULES.loadMinus);
    expect(part(bad, "energy")!.points).toBe(-FORM_RULES.energyMinus);

    const good = computeForm(history(40, (_, back) => (back === 0 ? { hrv: 400, sleepScore: 100, restingHr: 30, sleepS: 60000 } : {})), D, none)!;
    expect(good.score).toBeLessThanOrEqual(100);
    expect(part(good, "hrv")!.points).toBe(FORM_RULES.hrvMax);
    expect(part(good, "sleep")!.points).toBe(FORM_RULES.sleepMax);
    expect(part(good, "rhr")!.points).toBe(FORM_RULES.rhrMax);
  });

  it("a new user: parts without enough history are missing, the rest still count", () => {
    const r = computeForm(history(5, (_, back) => (back === 0 ? { hrv: 75, sleepNeedS: null } : { sleepNeedS: null })), D, none)!;
    expect(part(r, "rhr")!.status).toBe("missing"); // needs 14 nights
    expect(part(r, "load")!.status).toBe("missing"); // needs 21 days
    expect(part(r, "sleepDebt")!.status).toBe("missing"); // no sleep need
    expect(part(r, "hrv")!.points).toBeGreaterThan(0); // Garmin's band works from night one
    expect(r.score).toBeGreaterThan(50);
  });

  it("HRV without Garmin's band falls back to the own 28-night median", () => {
    const r = computeForm(history(40, (_, back) => ({ hrvLow: null, hrvHigh: null, hrv: back === 0 ? 40 : 60 + (back % 3) })), D, none)!;
    expect(part(r, "hrv")!.status).toBe("ok");
    expect(part(r, "hrv")!.points).toBeLessThan(0);
  });

  it("sleep debt: half an hour short a night is free, two hours short a night is the full minus", () => {
    const short = (s: number) => computeForm(history(40, () => ({ sleepS: 28800 - s })), D, none)!;
    expect(part(short(1800), "sleepDebt")!.points).toBe(0);
    expect(part(short(7200), "sleepDebt")!.points).toBe(-FORM_RULES.debtMinus);
  });

  it("energy: three logged days with a big deficit pull down; carbs only before a hard session", () => {
    const days = history(40, (_, back) => (back >= 1 && back <= 3 ? { food: food(1000, 2) } : {}));
    const r = computeForm(days, D, { findings: [], hardPlanned: true })!;
    expect(part(r, "energy")!.points).toBe(-FORM_RULES.energyMinus);
    expect(part(r, "carbs")!.points).toBeLessThan(0);
    const gap = computeForm(history(40, (_, back) => (back === 1 || back === 3 ? { food: food(1000) } : {})), D, none)!;
    expect(part(gap, "energy")!.status).toBe("missing"); // one of the three days not logged
  });

  it("learned: an agreeing run-form finding strengthens its part; a rest finding adds a part; all within ±8", () => {
    const days = history(40, (_, back) => (back === 0 ? { hrv: 70 } : back === 5 ? { hard: true } : {}));
    const plain = computeForm(days, D, none)!;
    const hrvFinding: FormFinding = { factor: "hrv", lag: 0, effectSd: 0.6, highBound: 65, lowBound: 50 };
    const boosted = computeForm(days, D, { findings: [hrvFinding], hardPlanned: false })!;
    expect(part(boosted, "hrv")!.learned).toBe(true);
    expect(part(boosted, "hrv")!.points).toBeCloseTo(part(plain, "hrv")!.points * FORM_RULES.learnedBoost, 0);

    const against = computeForm(days, D, { findings: [{ ...hrvFinding, effectSd: -0.6 }], hardPlanned: false })!;
    expect(part(against, "hrv")).toMatchObject({ learned: false, points: part(plain, "hrv")!.points });

    const rest = computeForm(days, D, { findings: [{ factor: "daysSinceHard", lag: 0, effectSd: 0.5, highBound: 4, lowBound: 1 }], hardPlanned: false })!;
    expect(part(rest, "rest")).toMatchObject({ learned: true, points: 5, values: { days: 5 } });

    const huge = computeForm(days, D, { findings: [hrvFinding, { factor: "daysSinceHard", lag: 0, effectSd: 3, highBound: 4, lowBound: 1 }], hardPlanned: false })!;
    const extra = part(huge, "rest")!.points + (part(huge, "hrv")!.points - part(plain, "hrv")!.points);
    expect(extra).toBeLessThanOrEqual(FORM_RULES.learnedMax + 0.1);
  });

  it("self-check needs 8 runs on each side", () => {
    const scores = new Map<ISODate, number>();
    const run = new Map<ISODate, number>();
    for (let i = 0; i < 16; i++) {
      const d = addDays(D, -i);
      scores.set(d, i % 2 ? 80 : 30);
      run.set(d, i % 2 ? 0.5 : -0.3);
    }
    expect(formSelfCheck(scores, run)).toEqual({ diffSd: 0.8, nHigh: 8, nLow: 8 });
    run.delete(D);
    expect(formSelfCheck(scores, run)).toBeNull();
  });

  it("week balance: fuel on hard days needs two logged hard days", () => {
    const one = weekBalance(history(70, (_, back) => (back === 2 ? { hard: true, food: food(900) } : {})), D);
    expect(one.hardDayDeficit).toBeNull();
    const two = weekBalance(history(70, (_, back) => (back === 2 || back === 5 ? { hard: true, food: food(back === 2 ? 900 : 500) } : {})), D);
    expect(two).toMatchObject({ hardDayDeficit: 700, hardDays: 2, loadRatio: 1, sleepVsNeedH: 0 });
  });
});

class FakeAi implements RecoveryAi {
  calls: string[] = [];
  next: unknown = null;
  async ask<T>(_k: string, _s: string, message: string) {
    this.calls.push(message);
    return { ok: true as const, value: this.next as T, usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 }, model: "claude-sonnet-5" };
  }
}

describe("Form: stored after compute, AI line behind consent", () => {
  let u: TestUser;
  let today: ISODate;
  const ai = new FakeAi();

  beforeAll(async () => {
    u = await createTestUser("form");
    ({ today } = await seedUser(admin(), u.id, { days: 2 }));
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
    await admin()
      .from("recovery_days")
      .insert(
        Array.from({ length: 40 }, (_, i) => ({
          user_id: u.id,
          local_date: addDays(today, -i),
          sleep_s: 27000,
          sleep_need_s: 28800,
          sleep_score: 70 + (i % 9),
          hrv_avg: 55 + (i % 7),
          hrv_baseline_low: 50,
          hrv_baseline_high: 66,
          resting_hr: 48 + (i % 4),
        })),
      );
  });
  afterAll(cleanup);

  it("computeRecovery stores Form for every night in the window", async () => {
    expect(await computeRecovery(u.id, today, { force: true })).toBe("computed");
    const { data } = await admin().from("form_days").select("local_date, score, band, parts").eq("user_id", u.id).order("local_date");
    expect(data).toHaveLength(40);
    const last = data!.at(-1)!;
    expect(last.local_date).toBe(today);
    expect(last.score).toBeGreaterThanOrEqual(0);
    const parts = last.parts as { id: string; status: string }[];
    expect(parts.find((p) => p.id === "hrv")!.status).toBe("ok");
    expect(parts.find((p) => p.id === "sleepDebt")!.status).toBe("ok");
  });

  it("AI line: none without consent; grounded, cached, rewritten when the numbers change", async () => {
    expect(await formNote(u.id, { ai, today })).toEqual({ ok: false, error: "consent_required" });
    expect(ai.calls).toHaveLength(0);
    await setAiHealthConsent(u.id, true);
    const enc = encryptSecret("sk-ant-test-0000000000000000");
    await admin().from("api_keys").insert({ user_id: u.id, provider: "anthropic", ciphertext: enc.ciphertext, iv: enc.iv, auth_tag: enc.authTag, last4: "0000" });

    ai.next = { sentences: [{ text: "HRV is in your normal range.", refs: ["part:hrv"] }, { text: "Made up.", refs: ["part:nope"] }, { text: "Energy.", refs: ["part:energy"] }] };
    const r = await formNote(u.id, { ai, today });
    expect(r.ok && r.answer.sentences.map((s) => s.text)).toEqual(["HRV is in your normal range."]); // energy is missing → not citable
    expect(ai.calls[0]).toContain("Parts:");
    await formNote(u.id, { ai, today });
    expect(ai.calls).toHaveLength(1); // same numbers → cached

    await admin().from("form_days").update({ score: 12 }).eq("user_id", u.id).eq("local_date", today);
    await formNote(u.id, { ai, today });
    expect(ai.calls).toHaveLength(2);
  });
});
