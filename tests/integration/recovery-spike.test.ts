import { describe, expect, it } from "vitest";
import { addDays, localDate } from "@loop/core";
import { loadTokens } from "@/lib/garmin/accounts";
import { httpGarmin } from "@/lib/garmin/adapter";
import { admin } from "./setup";

/** Paths and values of a payload; arrays shown by length only. */
const paths = (v: unknown, p = ""): string[] =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.entries(v).flatMap(([k, x]) => paths(x, p ? `${p}.${k}` : k))
    : [`${p} = ${Array.isArray(v) ? `[${v.length}]` : JSON.stringify(v)}`];

/** Manual: SPIKE_EMAIL=<connected account> pnpm exec vitest run tests/integration/recovery-spike.test.ts (needs the local adapter on :3200). */
describe.skipIf(!process.env.SPIKE_EMAIL)("spike: real Garmin recovery payloads", () => {
  it("prints sleep, HRV and activity Training Effect fields", async () => {
    const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
    const user = data.users.find((u) => u.email === process.env.SPIKE_EMAIL);
    expect(user).toBeTruthy();
    const { data: profile } = await admin().from("profiles").select("timezone").eq("user_id", user!.id).single();
    const tokens = await loadTokens(user!.id);
    expect(tokens).toBeTruthy();
    const today = localDate(profile?.timezone ?? "UTC");
    const res = await httpGarmin().fetchRecovery(tokens!, [addDays(today, -1), addDays(today, -40)]);
    console.log(`response size for ${res.nights.length} nights: ${JSON.stringify(res).length} bytes`);
    for (const n of res.nights) {
      console.log(`=== ${n.date} SLEEP\n${paths(n.sleep).join("\n")}\n=== ${n.date} HRV\n${paths(n.hrv).join("\n")}`);
    }
    const { data: acts } = await admin().from("activities").select("type_key, raw").eq("user_id", user!.id).order("start_time", { ascending: false }).limit(3);
    for (const a of acts ?? []) console.log(a.type_key, Object.entries((a.raw ?? {}) as Record<string, unknown>).filter(([k]) => /trainingeffect/i.test(k)));
  }, 120_000);
});
