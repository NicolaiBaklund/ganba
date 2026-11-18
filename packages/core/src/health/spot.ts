/** What the place under the race clock shows (spec 2026-11-18 §4.2): one main item, first that applies. */
export type SpotMain = "alert" | "verdict" | "week" | "challenge";

export function pickSpot(i: { alert: boolean; verdict: boolean; week: boolean; challengeOpen: boolean }): { main: SpotMain | null; challengeLine: boolean } {
  const main: SpotMain | null = i.alert ? "alert" : i.verdict ? "verdict" : i.week ? "week" : i.challengeOpen ? "challenge" : null;
  return { main, challengeLine: i.challengeOpen && main !== "challenge" && main !== null };
}
