// Training only (spec 2026-10-29): sign up → "Training only" → a plan from the stated volume, no Garmin → Today
// with the bib and the week card → "Mark as done" logs the run → Undo. Three tabs, no calories anywhere.
// Light runs the flow, dark looks at the same pages.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

config({ path: "apps/web/.env.local" });
const BASE = process.argv[2] ?? "http://localhost:3100";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `trainonly+${Date.now()}@loop.test`, password = `P-${crypto.randomUUID()}`;
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = c.user.id;
const checks = {};
const errors = [];
const noCalories = async (page) => (await page.getByText(/kcal|calorie/i).count()) === 0;

try {
  const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const browser = await chromium.launch();
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 2, isMobile: true, colorScheme: scheme });
    await ctx.addCookies([{ name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url"), domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`${page.url()} ${m.text().slice(0, 1500)}`));
    const shot = (n) => page.screenshot({ path: `tests/smoke/out/training-only-${scheme}-${n}.png`, fullPage: true });

    if (scheme === "light") {
      await page.goto(`${BASE}/today`);
      await page.waitForURL(/\/onboarding/);
      await shot("1-choice");
      await page.getByRole("button", { name: /Training only/ }).click();
      await page.waitForURL(/\/training\/new/, { timeout: 30_000 });
      checks["Training only goes straight to the plan"] = true;

      await page.getByRole("button", { name: "Build fitness" }).click();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      checks["asks how much they run"] = (await page.getByText("Your running lately").count()) === 1;
      await page.getByLabel("Km per week").fill("25");
      await page.getByLabel("Longest run").fill("10");
      await shot("2-start");
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByText("Based on the volume you entered").waitFor({ timeout: 30_000 }).catch(() => null);
      checks["preview starts from the stated volume"] = (await page.getByText("Based on the volume you entered").count()) === 1;
      await page.getByRole("button", { name: "Create plan" }).click({ timeout: 60_000 });
      await page.waitForURL(/\/training$/, { timeout: 60_000 });
      checks["Training shows the plan without Garmin"] = (await page.getByRole("button", { name: "End plan" }).count()) === 1;

      // A session today, so it can be marked done.
      const { data: plan } = await admin.from("training_plans").select("id").eq("user_id", uid).eq("status", "active").single();
      const { data: ws } = await admin.from("planned_workouts").select("id, date").eq("plan_id", plan.id).eq("status", "planned").order("date");
      const { data: prof } = await admin.from("profiles").select("timezone").eq("user_id", uid).single();
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: prof.timezone }).format(new Date());
      if (!ws.some((w) => w.date === today)) await admin.from("planned_workouts").update({ date: today }).eq("id", ws[0].id);
    }

    await page.goto(`${BASE}/today`);
    await page.locator("nav").waitFor();
    const navLinks = await page.locator("nav a").allInnerTexts();
    checks[`${scheme}: three tabs`] = navLinks.length === 3 && !navLinks.some((x) => /Body/.test(x));
    checks[`${scheme}: Today has the week card`] = (await page.getByText(/sessions done/).count()) === 1;
    checks[`${scheme}: no calories on Today`] = await noCalories(page);
    await shot("3-today");

    if (scheme === "light") {
      await page.getByRole("button", { name: "Mark as done" }).click();
      await page.getByPlaceholder("mm:ss").fill("3200");
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByText("Logged by you").waitFor({ timeout: 20_000 }).catch(() => null);
      checks["Done logs the run"] = (await page.getByText("Logged by you").count()) === 1;
      checks["week card counts it"] = (await page.getByText(/^1 of \d+ sessions done/).count()) === 1;
      await shot("4-done");
      await page.getByRole("button", { name: "Undo" }).click();
      await page.getByRole("button", { name: "Mark as done" }).waitFor({ timeout: 20_000 }).catch(() => null);
      checks["Undo opens the session again"] = (await page.getByRole("button", { name: "Mark as done" }).count()) === 1;
      // Done again, for the dark screenshots.
      await page.getByRole("button", { name: "Mark as done" }).click();
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByText("Logged by you").waitFor({ timeout: 20_000 }).catch(() => null);
    }

    await page.goto(`${BASE}/food`);
    await page.waitForURL(/\/today/, { timeout: 15_000 }).catch(() => null);
    checks[`${scheme}: food sends to Today`] = /\/today/.test(page.url());

    await page.goto(`${BASE}/training`);
    await page.getByRole("button", { name: "End plan" }).waitFor({ timeout: 30_000 }).catch(() => null);
    checks[`${scheme}: no calories on Training`] = await noCalories(page);
    await shot("5-training");
    await page.locator('a[href^="/training/workout/"]').first().click();
    await page.waitForURL(/\/training\/workout\//);
    checks[`${scheme}: no fueling or watch on the session`] = (await page.getByText(/Fuel|watch/i).count()) === 0;
    await shot("6-session");

    await page.goto(`${BASE}/profile`);
    await page.getByRole("link", { name: "Turn on food tracking" }).waitFor({ timeout: 15_000 }).catch(() => null);
    checks[`${scheme}: profile offers food tracking`] = (await page.getByRole("link", { name: "Turn on food tracking" }).count()) === 1;
    checks[`${scheme}: no calorie settings in profile`] = (await page.getByText(/Base target|Protein/).count()) === 0;
    await shot("7-profile");
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
