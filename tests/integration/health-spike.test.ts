import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTokens } from "@/lib/garmin/accounts";
import { admin } from "./setup";

/** Manual: SPIKE_EMAIL=<account> pnpm exec vitest run tests/integration/health-spike.test.ts — read-only Garmin calls for Health (race predictions back in time, personal records). */
describe.skipIf(!process.env.SPIKE_EMAIL)("spike: Garmin data for Health", () => {
  it("prints daily race predictions for the last 90 days and the personal records", async () => {
    const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
    const user = data.users.find((u) => u.email === process.env.SPIKE_EMAIL)!;
    const tokens = await loadTokens(user.id);
    expect(tokens).toBeTruthy();
    const tf = join(tmpdir(), `gt-${Date.now()}.txt`);
    writeFileSync(tf, tokens!);
    const py = `
import json, sys, datetime
sys.path.insert(0, "apps/web/api/py")
from garmin import session_from, _profile
g = session_from(open(${JSON.stringify(tf)}).read())
_profile(g)
today = datetime.date.today()
def show(name, f):
    try:
        r = f()
        print("==", name, json.dumps(r, default=str)[:3000])
    except Exception as e:
        print("==", name, "ERROR", type(e).__name__, str(e)[:300])
p = g.get_race_predictions((today - datetime.timedelta(days=90)).isoformat(), today.isoformat(), "daily")
print("== predictions", len(p), [(x["calendarDate"], x["time5K"], x["timeHalfMarathon"]) for x in p[::7]] + [(p[-1]["calendarDate"], p[-1]["time5K"], p[-1]["timeHalfMarathon"])])
print("== prs", [(r["typeId"], round(r["value"], 1), (r.get("activityStartDateTimeLocalFormatted") or r.get("prStartTimeGmtFormatted") or "")[:10], r["activityType"]) for r in g.get_personal_record()])
`;
    try {
      console.log(execFileSync(".venv/Scripts/python", ["-c", py], { encoding: "utf8", timeout: 90_000 }));
    } finally {
      unlinkSync(tf);
    }
  }, 120_000);
});
