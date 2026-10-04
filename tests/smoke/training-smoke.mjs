// Training: Garmin-connected user with run history creates a 10K plan in the wizard,
// sees this week, opens a session, and sees today's session + target breakdown on Today.
// Garmin itself is not called: the account row has dummy tokens, so pushes are skipped.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { seedUser } from "./seed.mjs";

config({ path: "apps/web/.env.local" });
const BASE = process.argv[2] ?? "http://localhost:3100";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `training+${Date.now()}@loop.test`, password = `P-${crypto.randomUUID()}`;
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = c.user.id;
let failed = false;
const addDays = (d, n) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
try {
  const { today } = await seedUser(admin, uid, { days: 20 });
  // "Connected" with unusable tokens (decrypt fails → treated as no tokens; nothing is sent to Garmin).
  await admin.from("garmin_accounts").insert({ user_id: uid, ciphertext: "x", iv: "x", auth_tag: "x", last_synced_at: new Date().toISOString(), history_imported_at: new Date().toISOString() });
  const acts = [];
  const days = [];
  for (let d = 35; d >= 1; d--) {
    const date = addDays(today, -d);
    days.push({ user_id: uid, local_date: date, steps: 10000, final: true });
    if (d % 2 === 0)
      acts.push({ user_id: uid, garmin_activity_id: 5_000_000 + d, local_date: date, start_time: `${date}T06:00:00Z`, type_key: "running", distance_m: 8000, duration_s: 2700, moving_s: 2650, avg_hr: 148, steps: 7000 });
  }
  days.push({ user_id: uid, local_date: today, steps: 6000, final: false });
  await admin.from("garmin_days").insert(days);
  await admin.from("activities").insert(acts);

  const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, timezoneId: "Europe/Oslo" });
  await ctx.addCookies([{ name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url"), domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 3000)));
  const shot = (name) => page.screenshot({ path: `tests/smoke/out/${name}.png`, fullPage: true, caret: "initial" });

  await page.goto(`${BASE}/training`);
  await shot("40-training-empty");
  await page.getByRole("link", { name: "Create plan" }).click();
  await page.getByRole("button", { name: "10K" }).click();
  await page.locator('input[type="date"]').fill(addDays(today, 63));
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await shot("41-wizard-days");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Your plan").waitFor();
  await shot("42-wizard-preview");
  await page.getByRole("button", { name: "Create plan" }).click();
  await page.waitForURL(/\/training$/);
  await page.getByText("Race day").first().waitFor();
  await shot("43-training-plan");

  const firstSession = page.locator('a[href^="/training/workout/"]').first();
  await firstSession.click();
  await page.waitForURL(/\/training\/workout\//);
  await shot("44-workout");
  const hasFuel = await page.getByText("Fuel", { exact: true }).count();

  await page.goto(`${BASE}/today`);
  await shot("45-today");
  const hasBreakdown = await page.getByText(/^\+\d+ activity$/).count();
  await browser.close();

  const { data: plan } = await admin.from("training_plans").select("id, vdot").eq("user_id", uid).eq("status", "active").single();
  const { data: ws } = await admin.from("planned_workouts").select("id, type, date").eq("plan_id", plan.id);
  const checks = {
    "plan created": !!plan,
    "plan has sessions": (ws ?? []).length > 10,
    "race on race day": (ws ?? []).some((w) => w.type === "race" && w.date === addDays(today, 63)),
    "activity tag on Today": hasBreakdown > 0,
    "fuel section on session": hasFuel > 0,
    "no console errors": errors.length === 0,
  };
  console.log(checks);
  if (errors.length) console.log(errors);
  failed = Object.values(checks).some((v) => !v);
} finally {
  await admin.auth.admin.deleteUser(uid).catch(() => {});
}
process.exit(failed ? 1 : 0);
