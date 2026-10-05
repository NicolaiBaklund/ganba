// Recovery: Garmin-connected user with 60 nights and a few stored findings opens the tab, a finding, a day,
// and Profile's AI switch. AI stays off: no AI request may be made.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { seedUser } from "./seed.mjs";

config({ path: "apps/web/.env.local" });
const BASE = process.argv[2] ?? "http://localhost:3100";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `recovery+${Date.now()}@loop.test`, password = `P-${crypto.randomUUID()}`;
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = c.user.id;
let failed = false;
const addDays = (d, n) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const check = (ok, msg) => {
  if (!ok) {
    failed = true;
    console.error("FAIL", msg);
  }
};
try {
  const { today } = await seedUser(admin, uid, { days: 20 });
  await admin.from("garmin_accounts").insert({ user_id: uid, ciphertext: "x", iv: "x", auth_tag: "x", last_synced_at: new Date().toISOString(), history_imported_at: new Date().toISOString(), recovery_backfilled_until: addDays(today, -89), recovery_computed_at: new Date().toISOString() });
  await admin.from("recovery_days").insert(
    Array.from({ length: 60 }, (_, i) => ({
      user_id: uid, local_date: addDays(today, -i), sleep_s: 26000 + (i % 5) * 900, deep_s: 5000, light_s: 14000, rem_s: 6000, awake_s: 700,
      sleep_score: 68 + ((i * 7) % 15), hrv_avg: 50 + ((i * 3) % 12), resting_hr: 47 + (i % 5), hrv_baseline_low: 48, hrv_baseline_high: 62,
    })),
  );
  const g = (n, mean, bound) => ({ n, mean, bound, values: Array.from({ length: n }, (_, i) => Math.round((mean + ((i * 37) % 11) - 5) * 10) / 10) });
  await admin.from("recovery_findings").insert([
    { user_id: uid, computed_at: new Date().toISOString(), question_id: "deficit-hrv", factor: "deficit", outcome: "hrv", lag: 1, kind: "finding", groups: { high: g(24, -4.1, 820), low: g(23, 2.2, 240), needed: 9 }, effect_sd: -0.9, q_value: 0.02, control_ok: true, rank: 1 },
    { user_id: uid, computed_at: new Date().toISOString(), question_id: "alcohol-sleep", factor: "alcohol", outcome: "sleepScore", lag: 1, kind: "finding", groups: { high: g(9, -6, null), low: g(60, 1, null), needed: 8 }, effect_sd: -0.8, q_value: 0.04, control_ok: true, rank: 2 },
    { user_id: uid, computed_at: new Date().toISOString(), question_id: "steps-sleep", factor: "steps", outcome: "sleepScore", lag: 1, kind: "no_effect", groups: { high: g(25, 0.3, 12000), low: g(25, 0.1, 7000), needed: 8 }, effect_sd: 0.05, rank: null },
    { user_id: uid, computed_at: new Date().toISOString(), question_id: "rest-run", factor: "daysSinceHard", outcome: "runForm", lag: 0, kind: "needs_data", reason: "few_days", groups: { high: g(4, 0.2, 3), low: g(5, -0.1, 1), needed: 8 }, rank: null },
  ]);

  const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, timezoneId: "Europe/Oslo" });
  await ctx.addCookies([{ name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url"), domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const errors = [];
  const aiCalls = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 3000)));
  page.on("request", (r) => /\/api\/recovery\/(summary|questions)|\/why/.test(r.url()) && aiCalls.push(r.url()));
  const shot = (name) => page.screenshot({ path: `tests/smoke/out/${name}.png`, fullPage: true, caret: "initial" });

  await page.goto(`${BASE}/recovery`);
  await page.getByText("What affects you").waitFor();
  await shot("60-recovery");
  check(await page.getByText("Deficit over 820 kcal").count(), "finding line with the real bound");
  check(await page.getByText("Turn on AI insights").count(), "AI-off link");
  await page.getByText("Deficit over 820 kcal").click();
  await page.getByText("days, first group").waitFor();
  await page.waitForTimeout(400); // sheet slide-in
  check((await page.locator('[role="dialog"] svg circle').count()) >= 40, "finding chart: one dot per day");
  await shot("61-recovery-finding");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More" }).click();
  check(await page.getByText("No clear link").count(), "no-effect list");
  check(await page.getByText("4 of 8 days").count(), "progress line");
  await shot("62-recovery-more");
  // Day buttons reach the day sheet without hitting a chart point (keyboard, screen reader).
  const dayButtons = page.getByRole("group", { name: "Pick a day" }).getByRole("button");
  check((await dayButtons.count()) === 7, "7 day buttons");
  await dayButtons.last().focus();
  await page.keyboard.press("Enter");
  await page.getByText("The day before").waitFor();
  await page.waitForTimeout(400);
  check(await page.getByText("No food logged").count() + (await page.getByText(/of \d+ kcal/).count()) > 0, "day before: food or 'No food logged'");
  await shot("63-recovery-day");
  check(!(await page.getByText("Why?").count()), "no Why? while AI is off");
  check(aiCalls.length === 0, `no AI requests with consent off (${aiCalls.join(", ")})`);

  await page.goto(`${BASE}/today`);
  check(await page.getByRole("link", { name: "All meals" }).count(), "All meals link on Today");
  await page.goto(`${BASE}/profile`);
  const sw = page.getByRole("switch", { name: "Use my health data with AI" });
  await sw.waitFor({ timeout: 30_000 }).catch(() => null);
  check(await sw.count(), "AI switch in Profile");
  check((await sw.getAttribute("aria-checked")) === "false", "AI switch off by default");
  await shot("64-profile-ai");
  check(!errors.length, `console errors: ${errors.join(" | ")}`);
  await browser.close();
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await admin.auth.admin.deleteUser(uid);
}
console.log(failed ? "recovery smoke FAILED" : "recovery smoke OK");
process.exit(failed ? 1 : 0);
