// Cross-training and power: a runner who also rides (with a power meter) makes a running plan with rides on
// another day through the wizard, then sees the Training page (cross days, power switch, ride zones in watts)
// and a ride session with watt steps, light and dark.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { seedUser } from "./seed.mjs";

config({ path: "apps/web/.env.local" });
const BASE = process.argv[2] ?? "http://localhost:3100";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `cross+${Date.now()}@loop.test`, password = `P-${crypto.randomUUID()}`;
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = c.user.id;
const addDays = (d, n) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const checks = {};
const errors = [];
try {
  const { today } = await seedUser(admin, uid, { days: 20 });
  // Thresholds fetched today already: no adapter call in the smoke run.
  await admin.from("garmin_accounts").insert({
    user_id: uid, ciphertext: "x", iv: "x", auth_tag: "x", last_synced_at: new Date().toISOString(), history_imported_at: new Date().toISOString(),
    lthr_running: 180, thresholds_at: new Date().toISOString(),
  });
  const acts = [];
  for (let d = 1; d <= 27; d++) {
    const date = addDays(today, -d);
    const id = 9_200_000 + d;
    if (d % 7 === 3)
      acts.push({ user_id: uid, garmin_activity_id: id, local_date: date, start_time: `${date}T07:00:00Z`, type_key: "road_biking", distance_m: 45000, duration_s: 5600, moving_s: 5400, avg_hr: 140, max_hr: 178, raw: { avgPower: 185, maxAvgPower_1200: 255, maxAvgPower_3600: 230 } });
    else if (d % 2 === 0)
      acts.push({ user_id: uid, garmin_activity_id: id, local_date: date, start_time: `${date}T07:00:00Z`, type_key: "running", distance_m: 9000, duration_s: 2900, moving_s: 2880, avg_hr: 150, max_hr: 175 });
  }
  await admin.from("activities").insert(acts);

  const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const browser = await chromium.launch();
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 2, isMobile: true, colorScheme: scheme });
    await ctx.addCookies([{ name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url"), domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
    const shot = (n) => page.screenshot({ path: `tests/smoke/out/cross-${scheme}-${n}.png`, fullPage: true });

    if (scheme === "light") {
      await page.goto(`${BASE}/training/new`);
      await page.getByRole("button", { name: "Build fitness" }).click();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      checks["cross days closed by default"] = (await page.getByRole("button", { name: "+ Add rides on other days" }).count()) === 1;
      await page.getByRole("button", { name: "+ Add rides on other days" }).click();
      // Default running days are Tue, Thu, Sun: rides on Saturday.
      await page.getByRole("button", { name: "Sat" }).last().click();
      await shot("1-days");
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByRole("switch", { name: "Power targets" }).waitFor({ timeout: 60_000 });
      await shot("2-preview");
      checks["preview: power on from recent rides"] = (await page.getByRole("switch", { name: "Power targets" }).getAttribute("aria-checked")) === "true";
      checks["preview: rides listed"] = (await page.getByText("Rides that week").count()) > 0;
      await page.getByRole("button", { name: "Create plan" }).click();
      await page.waitForURL(/\/training$/, { timeout: 60_000 });
    }
    await page.goto(`${BASE}/training`);
    await page.getByText("Easy rides on").waitFor();
    await shot("3-training");
    checks[`${scheme}: power switch on`] = (await page.getByRole("switch", { name: "Power targets" }).getAttribute("aria-checked")) === "true";
    checks[`${scheme}: ride zones in watts`] = (await page.getByText("Ride power zones (W)").count()) > 0;
    checks[`${scheme}: paces still there`] = (await page.getByText("Paces").count()) > 0;
    const rideLink = page.locator('a[href^="/training/workout/"]', { hasText: /Endurance ride/ }).first();
    await rideLink.click();
    await page.waitForURL(/\/training\/workout\//);
    await shot("4-ride");
    checks[`${scheme}: watt steps`] = (await page.getByText(/\d+–\d+ W/).count()) > 0;
    checks[`${scheme}: no pace on the ride`] = (await page.getByText(/\/km/).count()) === 0;
    await ctx.close();
  }
  await browser.close();
  checks["no console errors"] = errors.length === 0;
} catch (e) {
  console.error(e);
  checks.crashed = false;
} finally {
  await admin.auth.admin.deleteUser(uid);
}
console.log(checks);
if (errors.length) console.log(errors);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
