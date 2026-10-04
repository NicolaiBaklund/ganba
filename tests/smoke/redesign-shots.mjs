// Screenshots every main screen in light and dark, using a seeded demo user (meals, weight trend,
// Garmin runs, a 10K plan with an interval session today). The demo user is kept between runs
// (tests/smoke/out/demo-user.json) so repeated runs are fast.
// Usage: node tests/smoke/redesign-shots.mjs [baseUrl] [--fresh | --delete]
//   default baseUrl http://localhost:3100 (app must be running); --fresh reseeds, --delete removes the user.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

config({ path: "apps/web/.env.local", quiet: true });
const args = process.argv.slice(2);
const BASE = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3100";
const OUT = "tests/smoke/out/redesign";
const STATE = "tests/smoke/out/demo-user.json";
const TZ = "Europe/Oslo";
mkdirSync(OUT, { recursive: true });

const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const must = (r) => {
  if (r.error) throw r.error;
  return r;
};

const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const day = (offset) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const weekdayOf = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();

async function deleteSaved() {
  if (!existsSync(STATE)) return;
  const { uid } = JSON.parse(readFileSync(STATE, "utf8"));
  await admin.auth.admin.deleteUser(uid).catch(() => {});
  rmSync(STATE);
}

async function seed() {
  const email = `demo+${Date.now()}@loop.test`;
  const password = `D-${crypto.randomUUID()}`;
  const { data: created } = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  const uid = created.user.id;
  must(await admin.from("profiles").insert({ user_id: uid, sex: "male", birth_date: "1996-04-12", height_cm: 184, timezone: TZ, checkin_weekday: 1, onboarded_at: `${day(-40)}T06:00:00Z` }));
  must(await admin.from("activity_baselines").insert({ user_id: uid, steps_per_day: 9000, run_km_per_week: 30, other_training_hours_per_week: 1, valid_from: day(-40) }));
  must(await admin.from("goals").insert({ user_id: uid, target_weight_kg: 80, rate_kg_per_week: -0.5, valid_from: day(-40) }));
  must(await admin.from("energy_plans").insert({ user_id: uid, base_expenditure_kcal: 2290, source: "garmin_connect", protein_g_per_kg: 2, fat_pct: 0.25, valid_from: day(-40) }));

  const noise = [0.3, -0.2, 0.1, 0.4, -0.3, 0, 0.2, -0.1, 0.3, -0.4];
  const weights = [];
  for (let i = 35; i >= 0; i--) {
    if (i % 6 === 3) continue;
    const kg = 86.4 - (35 - i) * 0.075 + noise[i % noise.length];
    weights.push({ user_id: uid, measured_at: `${day(-i)}T05:30:00Z`, local_date: day(-i), weight_kg: Math.round(kg * 10) / 10 });
  }
  must(await admin.from("weight_entries").insert(weights));

  const meals = [
    { meal: "breakfast", at: "06:40", source: "ai", items: [
      { name: "Greek yoghurt", grams: 250, kcal: 238, protein_g: 25, carbs_g: 10, fat_g: 10, confidence: "high" },
      { name: "Granola", grams: 45, kcal: 205, protein_g: 4.5, carbs_g: 29, fat_g: 7.5, confidence: "medium" },
      { name: "Blueberries", grams: 100, kcal: 57, protein_g: 0.7, carbs_g: 14, fat_g: 0.3, confidence: "high" },
    ] },
    { meal: "lunch", at: "11:30", source: "ai", items: [
      { name: "Chicken katsu", grams: 160, kcal: 390, protein_g: 34, carbs_g: 20, fat_g: 19, confidence: "medium" },
      { name: "Rice, cooked", grams: 220, kcal: 286, protein_g: 5.9, carbs_g: 62, fat_g: 0.7, confidence: "medium" },
      { name: "Curry sauce", grams: 150, kcal: 165, protein_g: 2.5, carbs_g: 18, fat_g: 9, confidence: "low" },
    ] },
    { meal: "snack", at: "14:10", source: "quick", items: [{ name: "Banana", grams: 120, kcal: 107, protein_g: 1.3, carbs_g: 27, fat_g: 0.4, confidence: null }] },
  ];
  // Today plus a few earlier days of logging, so the week strip shows logged days.
  for (const offset of [0, -1, -2, -4]) {
    const d = day(offset);
    for (const m of offset === 0 ? meals : meals.slice(0, 2)) {
      const { data: e } = must(await admin.from("food_entries").insert({ user_id: uid, logged_at: `${d}T${m.at}:00+02:00`, local_date: d, meal_type: m.meal, source: m.source }).select("id").single());
      must(await admin.from("food_items").insert(m.items.map((it) => ({ ...it, user_id: uid, food_entry_id: e.id }))));
    }
  }

  must(await admin.from("garmin_accounts").insert({ user_id: uid, ciphertext: "x", iv: "x", auth_tag: "x", last_synced_at: new Date().toISOString(), last_synced_date: today, history_imported_at: new Date().toISOString(), race_predictions: { time10K: 2930, time5K: 1390 }, race_predictions_at: new Date().toISOString() }));
  const days = [];
  const acts = [];
  for (let i = 35; i >= 1; i--) {
    const d = day(-i);
    const wd = weekdayOf(d);
    days.push({ user_id: uid, local_date: d, steps: 8500 + ((i * 1371) % 6000), final: true });
    const run = (km, min, laps) =>
      acts.push({ user_id: uid, garmin_activity_id: 9_000_000 + i, local_date: d, start_time: `${d}T05:00:00Z`, type_key: "running", name: "Morning run", distance_m: km * 1000, duration_s: min * 60, moving_s: min * 60, avg_hr: 152, max_hr: 178, steps: Math.round(km * 820), splits: laps ? { lapDTOs: laps } : null });
    if (wd === 2) run(8, 46, [{ distance: 800, duration: 214, averageSpeed: 3.74, averageHR: 172 }, { distance: 800, duration: 216, averageSpeed: 3.7, averageHR: 174 }]);
    if (wd === 4) run(7, 41);
    if (wd === 6) run(5, 30);
    if (wd === 0) run(12, 72);
  }
  days.push({ user_id: uid, local_date: today, steps: 7340, final: false });
  must(await admin.from("garmin_days").insert(days));
  must(await admin.from("activities").insert(acts));
  await admin.from("api_keys").insert({ user_id: uid, ciphertext: "x", iv: "x", auth_tag: "x", last4: "demo" });

  writeFileSync(STATE, JSON.stringify({ uid, email, password, planned: false }));
  return { uid, email, password, planned: false };
}

async function context(browser, user, scheme) {
  const { data: s } = await anon.auth.signInWithPassword({ email: user.email, password: user.password });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: TZ, colorScheme: scheme, locale: "en-GB" });
  const value = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const name = `sb-${ref}-auth-token`;
  const size = 3180;
  const cookies = value.length <= size ? [{ name, value }] : Array.from({ length: Math.ceil(value.length / size) }, (_, i) => ({ name: `${name}.${i}`, value: value.slice(i * size, (i + 1) * size) }));
  await ctx.addCookies(cookies.map((c) => ({ ...c, domain: new URL(BASE).hostname, path: "/", sameSite: "Lax" })));
  return ctx;
}

async function createPlan(page, user) {
  const weekdays = [...new Set([2, 4, 0, weekdayOf(today)])];
  const res = await page.request.post(`${BASE}/api/training/plan`, {
    data: { goal: { kind: "race", distance: "10k", raceDate: day(70) }, weekdays, longRunWeekday: 0, runsPerWeek: Math.min(4, weekdays.length) },
  });
  if (!res.ok()) throw new Error(`plan: ${res.status()} ${await res.text()}`);
  const { data: plan } = await admin.from("training_plans").select("id").eq("user_id", user.uid).eq("status", "active").single();
  const { data: ws } = await admin.from("planned_workouts").select("id, date, type").eq("plan_id", plan.id).order("date");
  const quality = ws.find((w) => w.type === "intervals") ?? ws.find((w) => w.type === "threshold");
  await admin.from("planned_workouts").delete().eq("plan_id", plan.id).eq("date", today).neq("id", quality.id);
  await admin.from("planned_workouts").update({ date: today, garmin_push_status: "pushed", garmin_workout_id: 1 }).eq("id", quality.id);
  await admin.from("planned_workouts").update({ garmin_push_status: "pushed", garmin_workout_id: 1 }).eq("plan_id", plan.id).lte("date", day(13));
  Object.assign(user, { planned: true, workoutId: quality.id });
  writeFileSync(STATE, JSON.stringify(user));
}

const mockEstimate = (page) =>
  page.route("**/api/food/estimate", (route) =>
    route.fulfill({
      json: {
        estimateId: null,
        estimate: {
          notes: "Portion looks like a regular restaurant plate.",
          items: [
            { name: "Salmon fillet, baked", grams: 150, kcal: 312, protein_g: 31, carbs_g: 0, fat_g: 20, alcohol_g: 0, confidence: "high", assumptions: "Atlantic salmon, little added oil." },
            { name: "Potatoes, boiled", grams: 220, kcal: 189, protein_g: 4.2, carbs_g: 42, fat_g: 0.2, alcohol_g: 0, confidence: "medium", assumptions: "Four small potatoes." },
            { name: "Broccoli", grams: 90, kcal: 31, protein_g: 2.5, carbs_g: 6, fat_g: 0.3, alcohol_g: 0, confidence: "high", assumptions: "Steamed." },
          ],
        },
        totals: { kcal: 532, proteinG: 37.7, carbsG: 48, fatG: 20.5 },
      },
    }),
  );

if (args.includes("--delete")) {
  await deleteSaved();
  console.log("demo user deleted");
  process.exit(0);
}
if (args.includes("--fresh")) await deleteSaved();
const user = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : await seed();

const browser = await chromium.launch();
const errors = [];
for (const scheme of ["light", "dark"]) {
  const ctx = await context(browser, user, scheme);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${scheme} ${page.url()}: ${e.message}`));
  if (!user.planned) await createPlan(page, user);
  const shot = async (name, full = false) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${scheme}-${name}.png`, fullPage: full, caret: "initial" });
  };
  const go = async (path) => {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
  };

  await go("/today");
  await shot("today");
  await shot("today-full", true);
  await go(`/today?date=${day(-1)}`);
  await shot("today-rest");
  await go("/training");
  await shot("training");
  await shot("training-full", true);
  const week2 = page.getByRole("button", { name: /Week 2/ });
  if (await week2.count()) {
    await week2.first().click();
    await shot("training-week2", true);
  }
  await go(`/training/workout/${user.workoutId}`);
  await shot("workout", true);
  await go("/food");
  await shot("food", true);
  await go("/body");
  await shot("body", true);
  await go("/profile");
  await shot("profile", true);
  await go("/training/new");
  await shot("wizard");
  await mockEstimate(page);
  await go("/food/log?mode=text");
  await page.locator("textarea").first().fill("Baked salmon with potatoes and broccoli");
  await page.getByRole("button", { name: "Estimate" }).click();
  await page.locator('input[value="Salmon fillet, baked"]').waitFor();
  await shot("food-log", true);
  await go("/today");
  await page.locator("nav button").first().click();
  await shot("plus-menu");
  await ctx.close();
}
await browser.close();
if (errors.length) console.log("page errors:\n" + errors.join("\n"));
console.log(`screenshots in ${OUT}/`);
