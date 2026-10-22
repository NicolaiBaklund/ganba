// Cycling: a Garmin-connected user with rides creates a cycling plan through the wizard (event, indoors),
// then sees the Training page (hours, zones, indoor switch) and a ride session (heart-rate steps), light and dark.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { seedUser } from "./seed.mjs";

config({ path: "apps/web/.env.local" });
const BASE = process.argv[2] ?? "http://localhost:3100";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `ride+${Date.now()}@loop.test`, password = `P-${crypto.randomUUID()}`;
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
  await admin.from("garmin_accounts").insert({ user_id: uid, ciphertext: "x", iv: "x", auth_tag: "x", last_synced_at: new Date().toISOString(), history_imported_at: new Date().toISOString() });
  const acts = [];
  for (let d = 2; d <= 27; d += 3)
    acts.push({ user_id: uid, garmin_activity_id: 9_100_000 + d, local_date: addDays(today, -d), start_time: `${addDays(today, -d)}T07:00:00Z`, type_key: d % 2 ? "indoor_cycling" : "cycling", distance_m: 40000, duration_s: 5400, moving_s: 5300, avg_hr: 140, max_hr: 182 });
  await admin.from("activities").insert(acts);

  const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const browser = await chromium.launch();
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 2, isMobile: true, colorScheme: scheme });
    await ctx.addCookies([{ name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url"), domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
    const shot = (n) => page.screenshot({ path: `tests/smoke/out/ride-${scheme}-${n}.png`, fullPage: true });

    if (scheme === "light") {
      await page.goto(`${BASE}/training/new`);
      await page.getByRole("button", { name: "Cycling" }).click();
      await page.getByRole("button", { name: "Event" }).click();
      await page.locator('input[type="date"]').fill(addDays(today, 70));
      await page.getByLabel("Distance (km)").fill("150");
      await page.getByLabel("Climbing (m, optional)").fill("1800");
      await shot("1-goal");
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByRole("button", { name: "Indoors (trainer)" }).click();
      await shot("2-days");
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByText("Threshold heart rate").waitFor({ timeout: 60_000 });
      await shot("3-preview");
      checks["preview shows expected time"] = (await page.getByText("Expected time").count()) > 0;
      checks["preview indoor preset from the choice"] = (await page.getByRole("switch", { name: "Riding indoors" }).getAttribute("aria-checked")) === "true";
      await page.getByRole("button", { name: "Create plan" }).click();
      await page.waitForURL(/\/training$/, { timeout: 60_000 });
    }
    await page.goto(`${BASE}/training`);
    await page.getByText("Heart rate zones").waitFor();
    await shot("4-training");
    checks[`${scheme}: 150K event header`] = (await page.getByText("150K").count()) > 0;
    checks[`${scheme}: indoor switch on`] = (await page.getByRole("switch", { name: "Riding indoors" }).getAttribute("aria-checked")) === "true";
    checks[`${scheme}: week bars in hours`] = (await page.getByText(/^\d+(\.\d)? h$/).count()) > 0;
    const first = page.locator('a[href^="/training/workout/"]').first();
    await first.click();
    await page.waitForURL(/\/training\/workout\//);
    await shot("5-workout");
    checks[`${scheme}: heart-rate steps`] = (await page.getByText(/\d+–\d+ bpm/).count()) > 0;
    checks[`${scheme}: no pace on rides`] = (await page.getByText(/\/km/).count()) === 0;
    await page.goto(`${BASE}/today`);
    await shot("6-today");
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
