import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTokens } from "@/lib/garmin/accounts";
import { admin } from "./setup";

/** Manual: SPIKE_EMAIL=<account> pnpm exec vitest run tests/integration/cycling-spike.test.ts — read-only Garmin calls for cycling. */
describe.skipIf(!process.env.SPIKE_EMAIL)("spike: Garmin cycling data", () => {
  it("prints lactate threshold, FTP, profile HR settings and the cycling workout builder", async () => {
    const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
    const user = data.users.find((u) => u.email === process.env.SPIKE_EMAIL)!;
    const tokens = await loadTokens(user.id);
    expect(tokens).toBeTruthy();
    const tf = join(tmpdir(), `gt-${Date.now()}.txt`);
    writeFileSync(tf, tokens!);
    const py = `
import json, sys, inspect
sys.path.insert(0, "apps/web/api/py")
from garmin import session_from
import garminconnect
g = session_from(open(${JSON.stringify(tf)}).read())
def show(name, f):
    try:
        r = f()
        print("==", name, json.dumps(r, default=str)[:1500])
    except Exception as e:
        print("==", name, "ERROR", type(e).__name__, str(e)[:200])
show("lactate", lambda: g.get_lactate_threshold())
show("ftp", lambda: g.get_cycling_ftp())
s = g.get_userprofile_settings()
ud = (s or {}).get("userData", {})
print("== profile keys", [k for k in ud.keys() if any(x in k.lower() for x in ["heart","lactate","threshold","ftp","vo2","max","age","birth","gender","weight"])])
print("== profile vals", {k: ud.get(k) for k in ud.keys() if any(x in k.lower() for x in ["heart","lactate","threshold","ftp","vo2","birth","gender"])})
show("max_metrics", lambda: g.get_max_metrics(__import__("datetime").date.today().isoformat()))
print("== upload_cycling_workout src")
print(inspect.getsource(garminconnect.Garmin.upload_cycling_workout)[:800])
`;
    try {
      console.log(execFileSync(".venv/Scripts/python", ["-c", py], { encoding: "utf8", timeout: 90_000 }));
    } finally {
      unlinkSync(tf);
    }
  }, 120_000);
});
