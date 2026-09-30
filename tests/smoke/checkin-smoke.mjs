// Weekly check-in in the browser: seeded 30-day user sees a proposal, accepts it, target changes, no duplicate row.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { seedUser } from "./seed.mjs";

config({ path: "apps/web/.env.local" });
const BASE = process.argv[2] ?? "http://localhost:3100";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `checkin+${Date.now()}@loop.test`, password = `C-${crypto.randomUUID()}`;
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = c.user.id;
let failed = false;
try {
  await seedUser(admin, uid);
  const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, timezoneId: "Europe/Oslo" });
  await ctx.addCookies([{ name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url"), domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));

  await page.goto(`${BASE}/today`);
  await page.getByText("Weekly check-in").waitFor();
  await page.screenshot({ path: "tests/smoke/out/20-checkin.png", fullPage: true });
  const before = await page.locator(".num").nth(0).textContent();
  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByText("New target set").waitFor();
  await page.reload();
  await page.waitForTimeout(500);
  const cardGone = (await page.getByText("Weekly check-in").count()) === 0;
  await page.screenshot({ path: "tests/smoke/out/21-after-accept.png", fullPage: true });
  await browser.close();

  const [{ data: rows }, { data: plans }] = await Promise.all([
    admin.from("weekly_checkins").select("status, computed_base_kcal, proposed_base_kcal, logged_days").eq("user_id", uid),
    admin.from("energy_plans").select("source, base_expenditure_kcal").eq("user_id", uid).order("created_at"),
  ]);
  console.log({ rows, plans, before });
  const checks = {
    "one check-in row": rows?.length === 1,
    "status accepted": rows?.[0]?.status === "accepted",
    "adaptive plan added": plans?.length === 2 && plans[1].source === "adaptive",
    "clamped to ±150": Math.abs(Number(plans?.[1]?.base_expenditure_kcal) - 2600) <= 150,
    "card gone after accept": cardGone,
    "no console errors": errors.length === 0,
  };
  console.log(checks);
  if (errors.length) console.log(errors);
  failed = Object.values(checks).some((v) => !v);
} finally {
  await admin.auth.admin.deleteUser(uid);
}
process.exit(failed ? 1 : 0);
