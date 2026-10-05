// README screenshots: seeds a realistic demo user (meals, weight trend, Garmin runs, a 10K plan),
// captures the main screens at phone size and composes a hero image. The demo user is deleted afterwards.
// Usage: node scripts/screenshots.mjs [baseUrl]   (default http://localhost:3100, app must be running)
import { mkdirSync, readFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

config({ path: "apps/web/.env.local", quiet: true });
const BASE = process.argv[2] ?? "http://localhost:3100";
const APP_NAME = process.env.APP_NAME ?? "Ganba";
const OUT = "docs/screenshots";
const TZ = "Europe/Oslo";
mkdirSync(OUT, { recursive: true });

const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
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

const email = `demo+${Date.now()}@loop.test`;
const password = `D-${crypto.randomUUID()}`;
const { data: created } = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
const uid = created.user.id;

try {
  // --- profile, goal, energy -------------------------------------------------------------
  must(await admin.from("profiles").insert({ user_id: uid, sex: "male", birth_date: "1996-04-12", height_cm: 184, timezone: TZ, checkin_weekday: 1, onboarded_at: `${today}T06:00:00Z` }));
  must(await admin.from("activity_baselines").insert({ user_id: uid, steps_per_day: 9000, run_km_per_week: 30, other_training_hours_per_week: 1, valid_from: day(-40) }));
  must(await admin.from("goals").insert({ user_id: uid, target_weight_kg: 80, rate_kg_per_week: -0.5, valid_from: day(-40) }));
  must(await admin.from("energy_plans").insert({ user_id: uid, base_expenditure_kcal: 2290, source: "garmin_connect", protein_g_per_kg: 2, fat_pct: 0.25, valid_from: day(-40) }));

  // --- weight: gentle downward trend with daily noise ---------------------------------------
  const noise = [0.3, -0.2, 0.1, 0.4, -0.3, 0, 0.2, -0.1, 0.3, -0.4];
  const weights = [];
  for (let i = 35; i >= 0; i--) {
    if (i % 6 === 3) continue; // a few missed weigh-ins
    const kg = 86.4 - (35 - i) * 0.075 + noise[i % noise.length];
    weights.push({ user_id: uid, measured_at: `${day(-i)}T05:30:00Z`, local_date: day(-i), weight_kg: Math.round(kg * 10) / 10 });
  }
  must(await admin.from("weight_entries").insert(weights));

  // --- today's meals (AI-logged and quick) ---------------------------------------------------
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
  for (const m of meals) {
    const { data: e } = must(await admin.from("food_entries").insert({ user_id: uid, logged_at: `${today}T${m.at}:00+02:00`, local_date: today, meal_type: m.meal, source: m.source }).select("id").single());
    must(await admin.from("food_items").insert(m.items.map((it) => ({ ...it, user_id: uid, food_entry_id: e.id }))));
  }

  // --- Garmin: connected (dummy tokens: nothing is sent to Garmin), 5 weeks of steps and runs ---
  must(await admin.from("garmin_accounts").insert({ user_id: uid, ciphertext: "x", iv: "x", auth_tag: "x", last_synced_at: new Date().toISOString(), last_synced_date: today, history_imported_at: new Date().toISOString(), race_predictions: { time10K: 2930, time5K: 1390 }, race_predictions_at: new Date().toISOString() }));
  const days = [];
  const acts = [];
  for (let i = 35; i >= 1; i--) {
    const d = day(-i);
    const wd = weekdayOf(d);
    days.push({ user_id: uid, local_date: d, steps: 8500 + ((i * 1371) % 6000), final: true });
    const run = (km, min, laps) =>
      acts.push({ user_id: uid, garmin_activity_id: 9_000_000 + i, local_date: d, start_time: `${d}T05:00:00Z`, type_key: "running", name: "Morning run", distance_m: km * 1000, duration_s: min * 60, moving_s: min * 60, avg_hr: 152, max_hr: 178, steps: Math.round(km * 820), splits: laps ? { lapDTOs: laps } : null });
    if (wd === 2) run(8, 46, [{ distance: 800, duration: 214, averageSpeed: 3.74, averageHR: 172 }, { distance: 800, duration: 216, averageSpeed: 3.7, averageHR: 174 }, { distance: 800, duration: 213, averageSpeed: 3.76, averageHR: 175 }]);
    if (wd === 4) run(7, 41);
    if (wd === 6) run(5, 30);
    if (wd === 0) run(12, 72);
  }
  days.push({ user_id: uid, local_date: today, steps: 7340, final: false });
  must(await admin.from("garmin_days").insert(days));
  must(await admin.from("activities").insert(acts));

  // --- recovery: 60 nights and the engine's stored results (the engine itself runs in the app) -----
  must(await admin.from("garmin_accounts").update({ recovery_backfilled_until: day(-89), recovery_computed_at: new Date().toISOString() }).eq("user_id", uid));
  must(await admin.from("recovery_days").insert(
    Array.from({ length: 60 }, (_, i) => ({
      user_id: uid, local_date: day(-i), sleep_s: 25800 + ((i * 37) % 7) * 600, deep_s: 5100, light_s: 13900, rem_s: 5900, awake_s: 700,
      sleep_score: 70 + ((i * 7) % 13), hrv_avg: 54 + ((i * 5) % 9) - (i % 6 === 2 ? 5 : 0), resting_hr: 46 + ((i * 3) % 5), hrv_baseline_low: 50, hrv_baseline_high: 62,
    })),
  ));
  const grp = (n, mean, bound) => ({ n, mean, bound, values: Array.from({ length: n }, (_, i) => Math.round((mean + ((i * 37) % 11) - 5) * 10) / 10) });
  const found = (question_id, factor, outcome, lag, kind, groups, effect_sd, rank, reason = null) =>
    ({ user_id: uid, computed_at: new Date().toISOString(), question_id, factor, outcome, lag, kind, reason, groups, effect_sd, q_value: kind === "finding" ? 0.03 : null, control_ok: kind === "finding" ? true : null, rank });
  must(await admin.from("recovery_findings").insert([
    found("deficit-hrv", "deficit", "hrv", 1, "finding", { high: grp(24, -4.2, 820), low: grp(23, 1.9, 240), needed: 9 }, -0.9, 1),
    found("alcohol-sleep", "alcohol", "sleepScore", 1, "finding", { high: grp(9, -6.4, null), low: grp(58, 0.8, null), needed: 8 }, -0.8, 2),
    found("sleep-run", "sleepScore", "runForm", 0, "finding", { high: grp(11, 0.4, 82), low: grp(10, -0.3, 72), needed: 8 }, 0.7, 3),
    found("steps-sleep", "steps", "sleepScore", 1, "no_effect", { high: grp(26, 0.3, 12400), low: grp(25, 0.1, 7100), needed: 8 }, 0.05, null),
    found("rest-run", "daysSinceHard", "runForm", 0, "needs_data", { high: grp(5, 0.2, 3), low: grp(6, -0.1, 1), needed: 8 }, null, null, "few_days"),
  ]));

  // --- browser ---------------------------------------------------------------------------------
  const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: TZ });
  await ctx.addCookies([{ name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url"), domain: new URL(BASE).hostname, path: "/" }]);
  const page = await ctx.newPage();
  // The demo Garmin tokens are fake: keep the app from syncing (it would flag "sign in again").
  await page.route("**/api/garmin/sync", (route) => route.fulfill({ json: { ok: true } }));
  const shot = async (name) => {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}.png`, caret: "initial" });
  };

  // Plan via the wizard: 10K in ~10 weeks, four days a week incl. today.
  await page.goto(`${BASE}/training/new`);
  await page.getByRole("button", { name: "10K", exact: true }).click();
  await page.locator('input[type="date"]').fill(day(70));
  await page.getByRole("button", { name: "Next" }).click();
  const names = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };
  const wanted = new Set([2, 4, 0, weekdayOf(today)]);
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const chip = page.getByRole("button", { name: names[d], exact: true }).first();
    const on = (await chip.getAttribute("class"))?.includes("bg-primary");
    if (wanted.has(d) !== !!on) await chip.click();
  }
  await page.getByRole("button", { name: String(Math.min(4, wanted.size)), exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByText("Your plan").waitFor();
  await shot("wizard");
  await page.getByRole("button", { name: "Create plan" }).click();
  await page.waitForURL(/\/training$/);

  // Make today's session an interval session (for the Today card and the session page).
  const { data: plan } = await admin.from("training_plans").select("id").eq("user_id", uid).eq("status", "active").single();
  const { data: ws } = await admin.from("planned_workouts").select("id, date, type").eq("plan_id", plan.id).order("date");
  const quality = ws.find((w) => w.type === "intervals") ?? ws.find((w) => w.type === "threshold");
  await admin.from("planned_workouts").delete().eq("plan_id", plan.id).eq("date", today).neq("id", quality.id);
  await admin.from("planned_workouts").update({ date: today, garmin_push_status: "pushed", garmin_workout_id: 1 }).eq("id", quality.id);
  await admin.from("planned_workouts").update({ garmin_push_status: "pushed", garmin_workout_id: 1 }).eq("plan_id", plan.id).lte("date", day(13));

  await page.goto(`${BASE}/today`);
  await page.getByText(/^\+\d+ activity$/).first().waitFor();
  await shot("today");

  await page.goto(`${BASE}/training`);
  await page.getByText("This week").waitFor();
  await shot("training");

  await page.goto(`${BASE}/training/workout/${quality.id}`);
  await page.getByText("Fuel", { exact: true }).waitFor();
  await shot("workout");

  await page.goto(`${BASE}/body`);
  await page.waitForTimeout(800);
  await shot("body");

  await page.goto(`${BASE}/recovery`);
  await page.getByText("What affects you").waitFor();
  await page.waitForTimeout(800);
  await shot("recovery");

  // AI food logging (estimate mocked: no API key or cost needed).
  await admin.from("api_keys").insert({ user_id: uid, ciphertext: "x", iv: "x", auth_tag: "x", last4: "demo" });
  await page.route("**/api/food/estimate", (route) =>
    route.fulfill({
      json: {
        estimateId: null,
        estimate: {
          notes: "Portion looks like a regular restaurant plate.",
          items: [
            { name: "Salmon fillet, baked", grams: 150, kcal: 312, protein_g: 31, carbs_g: 0, fat_g: 20, alcohol_g: 0, confidence: "high", assumptions: "Atlantic salmon, little added oil." },
            { name: "Potatoes, boiled", grams: 220, kcal: 189, protein_g: 4.2, carbs_g: 42, fat_g: 0.2, alcohol_g: 0, confidence: "medium", assumptions: "Four small potatoes." },
            { name: "Broccoli", grams: 90, kcal: 31, protein_g: 2.5, carbs_g: 6, fat_g: 0.3, alcohol_g: 0, confidence: "high", assumptions: "Steamed." },
            { name: "Butter sauce", grams: 30, kcal: 165, protein_g: 0.3, carbs_g: 1, fat_g: 18, alcohol_g: 0, confidence: "low", assumptions: "About two tablespoons." },
          ],
        },
        totals: { kcal: 697, proteinG: 38, carbsG: 49, fatG: 38.5 },
      },
    }),
  );
  await page.goto(`${BASE}/food/log?mode=text`);
  await page.locator("textarea").first().fill("Baked salmon with potatoes, broccoli and butter sauce");
  await page.getByRole("button", { name: "Estimate" }).click();
  await page.locator(`input[value="Salmon fillet, baked"]`).waitFor();
  await shot("food-ai");
  await browser.close();

  // --- hero: four phones side by side -------------------------------------------------------------
  const img = (n) => `data:image/png;base64,${readFileSync(`${OUT}/${n}.png`).toString("base64")}`;
  const hero = await chromium.launch();
  const hp = await hero.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await hp.setContent(`<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap"><style>
    body{margin:0;width:1600px;height:900px;background:#eef0f2;font-family:Archivo,system-ui,sans-serif;color:#000;display:flex;flex-direction:column;align-items:center;overflow:hidden}
    h1{margin:56px 0 6px;font-size:72px;font-weight:900;font-stretch:62%;letter-spacing:-1px}
    p{margin:0 0 40px;color:#5f646d;font-size:24px}
    .row{display:flex;gap:36px;align-items:flex-start}
    .phone{width:300px;height:650px;border-radius:44px;padding:10px;background:#000;box-shadow:0 30px 60px -30px rgba(0,0,0,.45)}
    .phone img{width:100%;height:100%;border-radius:34px;object-fit:cover;object-position:top}
    .phone:nth-child(2),.phone:nth-child(3){margin-top:-24px}
  </style></head><body><h1>${APP_NAME}</h1><p>Training plan, nutrition and weight. One daily target that follows your Garmin.</p>
  <div class="row">${["today", "training", "workout", "food-ai"].map((n) => `<div class="phone"><img src="${img(n)}"/></div>`).join("")}</div></body></html>`);
  await hp.evaluate(() => document.fonts.ready);
  await hp.screenshot({ path: `${OUT}/hero.png` });
  await hero.close();
  console.log(`screenshots written to ${OUT}/`);
} finally {
  await admin.auth.admin.deleteUser(uid).catch(() => {});
}
