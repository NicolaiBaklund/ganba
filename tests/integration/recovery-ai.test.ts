import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, dayRefs, findingRefs, keepGrounded, RECOVERY_QUESTIONS, validateProposals, weekStartOn, zonedTime } from "@loop/core";
import { encryptSecret } from "@/lib/ai/crypto";
import type { RecoveryAi } from "@/lib/ai/recovery";
import { saveTokens } from "@/lib/garmin/accounts";
import { computeRecovery } from "@/lib/recovery/compute";
import { setAiHealthConsent } from "@/lib/recovery/consent";
import { proposeQuestions } from "@/lib/recovery/insights";
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
    expect(await proposeQuestions(u.id, { ai })).toEqual({ ok: false, error: "consent_required" });
    expect(ai.calls).toHaveLength(0);
  });

  it("consent on but no key: a clear error, still no AI call", async () => {
    await setAiHealthConsent(u.id, true);
    expect(await proposeQuestions(u.id, { ai })).toEqual({ ok: false, error: "no_key" });
    expect(ai.calls).toHaveLength(0);
    const enc = encryptSecret("sk-ant-test-0000000000000000");
    await admin().from("api_keys").insert({ user_id: u.id, provider: "anthropic", ciphertext: enc.ciphertext, iv: enc.iv, auth_tag: enc.authTag, last4: "0000" });
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
    expect((await proposeQuestions(u.id, { ai })).ok).toBe(false);
    expect(ai.calls.length).toBe(n);
    await computeRecovery(u.id, today, { force: true });
    const { data: rows } = await admin().from("recovery_findings").select("question_id").eq("user_id", u.id).eq("source", "ai");
    expect(rows).toEqual([]);
  });
});
