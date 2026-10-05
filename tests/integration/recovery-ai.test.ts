import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, dayRefs, findingRefs, keepGrounded, RECOVERY_QUESTIONS, validateProposals, weekStartOn, zonedTime } from "@loop/core";
import { encryptSecret } from "@/lib/ai/crypto";
import type { RecoveryAi } from "@/lib/ai/recovery";
import { saveTokens } from "@/lib/garmin/accounts";
import { computeRecovery } from "@/lib/recovery/compute";
import { setAiHealthConsent } from "@/lib/recovery/consent";
import { dayAnswer, proposeQuestions, weeklySummary } from "@/lib/recovery/insights";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";

describe("recovery AI: the ground rule and proposal checks", () => {
  const allowed = new Set([...dayRefs([{ date: "2026-10-01", hrv: 52, deficitKcal: 900, alcoholG: null }]), ...findingRefs([{ id: "deficit-hrv" } as never])]);

  it("keeps only sentences whose every reference exists", () => {
    const out = keepGrounded(
      [
        { text: "HRV was 52 ms.", refs: ["day:2026-10-01:hrv"] },
        { text: "Big deficits lower your HRV.", refs: ["finding:deficit-hrv", "day:2026-10-01:deficitKcal"] },
        { text: "You drank wine.", refs: ["day:2026-10-01:alcoholG"] }, // null in the table → not citable
        { text: "Sleep was great.", refs: [] },
        { text: "Made up.", refs: ["finding:nope"] },
      ],
      allowed,
      5,
    );
    expect(out.map((s) => s.text)).toEqual(["HRV was 52 ms.", "Big deficits lower your HRV."]);
  });

  it("proposals: unknown shapes, copies and more than 3 are dropped", () => {
    const out = validateProposals(
      {
        proposals: [
          { factor: "deficit", transform: "tertile", threshold: null, outcome: "hrv", lag: 1, rationale: "copy" },
          { factor: "steps", transform: "binary", threshold: null, outcome: "sleepScore", lag: 1, rationale: "binary on numbers" },
          { factor: "carbs", transform: "threshold", threshold: null, outcome: "runForm", lag: 1, rationale: "no threshold" },
          { factor: "protein", transform: "tertile", threshold: null, outcome: "restingHr", lag: 1, rationale: "ok 1" },
          { factor: "hrv", transform: "tertile", threshold: null, outcome: "restingHr", lag: -1, rationale: "reverse direction" },
          { factor: "steps", transform: "threshold", threshold: 15000, outcome: "hrv", lag: 2, rationale: "ok 2" },
          { factor: "late", transform: "binary", threshold: null, outcome: "hrv", lag: 1, rationale: "ok 3" },
          { factor: "alcohol", transform: "binary", threshold: null, outcome: "runForm", lag: 1, rationale: "4th" },
          { factor: "hrv", transform: "tertile", threshold: null, outcome: "sleepScore", lag: -4, rationale: "lag out of range" },
        ],
      },
      RECOVERY_QUESTIONS,
    );
    expect(out.map((q) => q.rationale)).toEqual(["ok 1", "ok 2", "ok 3"]);
  });
});

class FakeAi implements RecoveryAi {
  calls: { system: string; message: string }[] = [];
  next: unknown = null;
  fail: "invalid_output" | "unavailable" | null = null;
  async ask<T>(_k: string, system: string, message: string) {
    this.calls.push({ system, message });
    const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 };
    if (this.fail) return { ok: false as const, error: this.fail, usage, model: "claude-sonnet-5" };
    return { ok: true as const, value: this.next as T, usage, model: "claude-sonnet-5" };
  }
}

describe("recovery AI: consent, grounding, caching", () => {
  let u: TestUser;
  let today: string;
  const ai = new FakeAi();
  const TZ = "Europe/Oslo";

  beforeAll(async () => {
    u = await createTestUser("recovery-ai");
    ({ today } = await seedUser(admin(), u.id, { days: 2 }));
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
    const nights = Array.from({ length: 75 }, (_, i) => ({ user_id: u.id, local_date: addDays(today, -i), sleep_s: 27000, sleep_score: 70 + (i % 9), hrv_avg: 55 + (i % 7), resting_hr: 48 + (i % 4) }));
    await admin().from("recovery_days").insert(nights);
  });
  afterAll(cleanup);

  it("consent off: no AI call at all", async () => {
    expect(await weeklySummary(u.id, { ai })).toEqual({ ok: false, error: "consent_required" });
    expect(await dayAnswer(u.id, today, { ai })).toEqual({ ok: false, error: "consent_required" });
    expect(await proposeQuestions(u.id, { ai })).toEqual({ ok: false, error: "consent_required" });
    expect(ai.calls).toHaveLength(0);
  });

  it("consent on but no key: a clear error, still no AI call", async () => {
    await setAiHealthConsent(u.id, true);
    expect(await weeklySummary(u.id, { ai })).toEqual({ ok: false, error: "no_key" });
    expect(ai.calls).toHaveLength(0);
    const enc = encryptSecret("sk-ant-test-0000000000000000");
    await admin().from("api_keys").insert({ user_id: u.id, provider: "anthropic", ciphertext: enc.ciphertext, iv: enc.iv, auth_tag: enc.authTag, last4: "0000" });
  });

  it("weekly summary: sentences with made-up references are removed; stored once per week", async () => {
    const weekStart = addDays(weekStartOn(today, 1), -7);
    ai.next = {
      headline: { text: "Steady week", refs: [`day:${addDays(weekStart, 2)}:hrv`] },
      sentences: [
        { text: "HRV held up.", refs: [`day:${addDays(weekStart, 2)}:hrv`] },
        { text: "Invented.", refs: ["finding:made-up"] },
        { text: "No refs.", refs: [] },
      ],
      tips: [{ text: "Keep it up.", refs: [`day:${addDays(weekStart, 3)}:sleepScore`] }],
    };
    const r = await weeklySummary(u.id, { ai });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.sentences.map((s) => s.text)).toEqual(["HRV held up."]);
    expect(r.summary.tips).toHaveLength(1);
    expect(r.summary.headline).toBe("Steady week");
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]!.message).toContain("Day table");
    await weeklySummary(u.id, { ai });
    expect(ai.calls).toHaveLength(1); // cached
  });

  it("nothing grounded left → nothing shown", async () => {
    await admin().from("recovery_summaries").delete().eq("user_id", u.id);
    ai.next = { headline: { text: "Wow", refs: [] }, sentences: [{ text: "Made up.", refs: ["finding:x"] }], tips: [] };
    const r = await weeklySummary(u.id, { ai });
    expect(r.ok && r.summary).toEqual({ headline: "", sentences: [], tips: [] });
  });

  it("the headline follows the ground rule too", async () => {
    await admin().from("recovery_summaries").delete().eq("user_id", u.id);
    const weekStart = addDays(weekStartOn(today, 1), -7);
    ai.next = {
      headline: { text: "Alcohol wrecked your week", refs: ["finding:made-up"] },
      sentences: [{ text: "HRV held up.", refs: [`day:${addDays(weekStart, 2)}:hrv`] }],
      tips: [],
    };
    const r = await weeklySummary(u.id, { ai });
    expect(r.ok && r.summary.headline).toBe("");
    expect(r.ok && r.summary.sentences).toHaveLength(1);
  });

  it("a failed summary is not retried on every open (24 h pause), then tried again", async () => {
    await admin().from("recovery_summaries").delete().eq("user_id", u.id);
    ai.fail = "invalid_output";
    expect(await weeklySummary(u.id, { ai })).toEqual({ ok: false, error: "invalid_output" });
    const n = ai.calls.length;
    expect(await weeklySummary(u.id, { ai })).toEqual({ ok: false, error: "invalid_output" });
    expect(ai.calls.length).toBe(n);
    const weekStart = addDays(weekStartOn(today, 1), -7);
    await admin()
      .from("recovery_summaries")
      .update({ content: { status: "failed", error: "invalid_output", at: new Date(Date.now() - 25 * 3600_000).toISOString() } })
      .eq("user_id", u.id)
      .eq("week_start", weekStart);
    ai.fail = null;
    ai.next = { headline: { text: "Fine", refs: [] }, sentences: [{ text: "HRV held up.", refs: [`day:${addDays(weekStart, 2)}:hrv`] }], tips: [] };
    const r = await weeklySummary(u.id, { ai });
    expect(r.ok).toBe(true);
    expect(ai.calls.length).toBe(n + 1);
  });

  it("Why?: cached per day, marked stale when the day's food changes, refreshed only on request", async () => {
    ai.next = { sentences: [{ text: "HRV was in your normal range.", refs: [`day:${today}:hrv`] }] };
    const first = await dayAnswer(u.id, today, { ai });
    expect(first.ok && first.answer.sentences).toHaveLength(1);
    const calls = ai.calls.length;
    const again = await dayAnswer(u.id, today, { ai });
    expect(again.ok && again.stale).toBe(false);
    expect(ai.calls.length).toBe(calls);

    const y = addDays(today, -1);
    const { data: es } = await admin()
      .from("food_entries")
      .insert([
        { user_id: u.id, logged_at: zonedTime(y, "12:00", TZ).toISOString(), local_date: y, meal_type: "lunch", source: "quick" },
        { user_id: u.id, logged_at: zonedTime(y, "18:00", TZ).toISOString(), local_date: y, meal_type: "dinner", source: "quick" },
      ])
      .select("id");
    await admin().from("food_items").insert(es!.map((e) => ({ user_id: u.id, food_entry_id: e.id, name: "Meal", kcal: 900, carbs_g: 100, protein_g: 40 })));
    const stale = await dayAnswer(u.id, today, { ai });
    expect(stale.ok && stale.stale).toBe(true);
    expect(ai.calls.length).toBe(calls);
    const fresh = await dayAnswer(u.id, today, { ai, refresh: true });
    expect(fresh.ok && fresh.stale).toBe(false);
    expect(ai.calls.length).toBe(calls + 1);
  });

  it("Why? does not go stale when only the findings change (they move with every sync)", async () => {
    await admin().from("recovery_findings").insert({
      user_id: u.id, computed_at: new Date().toISOString(), question_id: "carbs-hrv", factor: "carbs", outcome: "hrv", lag: 1, kind: "finding",
      groups: { high: { n: 20, mean: 3, bound: 5 }, low: { n: 20, mean: -2, bound: 3 }, needed: 8 }, effect_sd: 0.6, rank: 1,
    });
    const r = await dayAnswer(u.id, today, { ai });
    expect(r.ok && r.stale).toBe(false);
    await admin().from("recovery_findings").delete().eq("user_id", u.id).eq("question_id", "carbs-hrv");
  });

  it("AI questions: a failed attempt still waits a month (no paid call on every open)", async () => {
    ai.fail = "unavailable";
    expect(await proposeQuestions(u.id, { ai })).toEqual({ ok: false, error: "unavailable" });
    const n = ai.calls.length;
    expect(await proposeQuestions(u.id, { ai })).toEqual({ ok: false, error: "not_due" });
    expect(ai.calls.length).toBe(n);
    ai.fail = null;
    await admin().from("garmin_accounts").update({ recovery_questions_at: null }).eq("user_id", u.id);
  });

  it("AI questions: the catalogue has no factor–outcome numbers; valid ones are stored and tested with q ≤ 0.05", async () => {
    ai.next = {
      proposals: [
        { factor: "steps", transform: "threshold", threshold: 12000, outcome: "hrv", lag: 1, rationale: "Busy days" },
        { factor: "deficit", transform: "tertile", threshold: null, outcome: "hrv", lag: 1, rationale: "copy" },
      ],
    };
    const r = await proposeQuestions(u.id, { ai });
    expect(r).toEqual({ ok: true, created: 1 });
    const msg = ai.calls.at(-1)!.message;
    expect(msg).toContain("Catalogue");
    expect(msg).not.toMatch(/effect|q_value|finding/i);
    expect(await proposeQuestions(u.id, { ai })).toEqual({ ok: false, error: "not_due" });

    await computeRecovery(u.id, today, { force: true });
    const { data: rows } = await admin().from("recovery_findings").select("question_id, source, ai_question_id").eq("user_id", u.id).eq("source", "ai");
    expect(rows).toHaveLength(1);
    expect(rows![0]!.ai_question_id).not.toBeNull();
  });

  it("switching consent off again stops everything, including testing AI questions", async () => {
    await setAiHealthConsent(u.id, false);
    const n = ai.calls.length;
    expect((await dayAnswer(u.id, today, { ai, refresh: true })).ok).toBe(false);
    expect(ai.calls.length).toBe(n);
    await computeRecovery(u.id, today, { force: true });
    const { data: rows } = await admin().from("recovery_findings").select("question_id").eq("user_id", u.id).eq("source", "ai");
    expect(rows).toEqual([]);
  });
});
