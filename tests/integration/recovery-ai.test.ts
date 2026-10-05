import { describe, expect, it } from "vitest";
import { dayRefs, findingRefs, keepGrounded, RECOVERY_QUESTIONS, validateProposals } from "@loop/core";

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
          { factor: "steps", transform: "threshold", threshold: 15000, outcome: "hrv", lag: 1, rationale: "ok 2" },
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
