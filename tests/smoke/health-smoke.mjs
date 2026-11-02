// Health (spec 2026-11-02): seeded user with a plan, a race session, predicted times and nights where resting HR
// is up and HRV low two mornings running. Training shows the race, the morning note with "Swap to easy", this week and the
// paces; "Plan" opens the whole plan;
// swapping turns today's intervals into an easy run. Progress shows the clock and the stamp book.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { seedUser } from "./seed.mjs";

config({ path: "apps/web/.env.local" });
const BASE = process.argv[2] ?? "http://localhost:3100";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `health+${Date.now()}@loop.test`, password = `H-${crypto.randomUUID()}`;
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = c.user.id;
const must = (r) => {
  if (r.error) throw r.error;
  return r;
};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());
const day = (n) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
let failed = false;
const results = {};
try {
  await seedUser(admin, uid);
  const { data: plan } = must(
    await admin
      .from("training_plans")
      .insert({ user_id: uid, goal_kind: "build", distance_km: 21.0975, start_date: day(-60), generated_until: day(80), weekdays: [1, 2, 3, 5], long_run_weekday: 5, runs_per_week: 4, vdot: 45, start_km_per_week: 30 })
      .select("id")
      .single(),
  );
  const w = (date, type, title, km, mins, week) => ({ user_id: uid, plan_id: plan.id, date, type, title, planned_km: km, planned_duration_s: mins * 60, blocks: [], phase: "build", week });
  must(
    await admin.from("planned_workouts").insert([
      w(today, "intervals", "Intervals 6 × 1 km", 12, 60, 9),
      w(day(25), "test", "Fitness test 5K", 10, 50, 12),
      w(day(46), "race", "Doomsday: Half Marathon", 21.1, 105, 15),
    ]),
  );
  // Predicted half marathon falling over 60 days (the plan's own value lands on today when the page loads).
  must(await admin.from("prediction_days").insert(Array.from({ length: 60 }, (_, i) => ({ user_id: uid, local_date: day(-60 + i), time_half_s: Math.round(6500 - i * 7 + (i % 5 === 0 ? 25 : 0)), time_5k_s: 1500 - i, time_10k_s: 3100 - i * 2, time_marathon_s: 13800 - i * 14, source: "plan" }))));
  // Singapore is too small for the globe's map: it shows as a dot.
  must(await admin.from("stamps").insert({ user_id: uid, kind: "country", key: "SGP", earned_on: day(-400) }));
  // A 15 km run in Tokyo last week: country, distance and volume stamps when the page loads.
  must(await admin.from("activities").insert({ user_id: uid, source: "manual", local_date: day(-5), start_time: `${day(-5)}T07:00:00Z`, type_key: "running", distance_m: 15200, duration_s: 5400, moving_s: 5400, raw: { startLatitude: 35.69, startLongitude: 139.7 } }));
  // Easy runs at 145 bpm: 6:00/km six to twelve weeks ago, 5:48 the last six weeks (Progress: easy pace at heart rate).
  must(
    await admin.from("activities").insert(
      [50, 55, 60, 65, 70, 8, 15, 22, 29, 36].map((n) => {
        const pace = n > 42 ? 360 : 348;
        return { user_id: uid, source: "manual", local_date: day(-n), start_time: `${day(-n)}T07:00:00Z`, type_key: "running", distance_m: 8000, duration_s: 8 * pace, moving_s: 8 * pace, avg_hr: 145 };
      }),
    ),
  );
  // 30 ordinary nights, then two with resting HR up and HRV under its baseline.
  must(
    await admin.from("recovery_days").insert(
      Array.from({ length: 32 }, (_, i) => {
        const off = i >= 30;
        return { user_id: uid, local_date: day(-31 + i), resting_hr: off ? 57 : 50 + (i % 3), hrv_avg: off ? 44 : 60 + (i % 4), hrv_baseline_low: 52, hrv_baseline_high: 68, sleep_score: 78, sleep_s: 27000, sleep_need_s: 28800 };
      }),
    ),
  );

  const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const browser = await chromium.launch();
  let todayHasClock = true;
  const errors = [];
  for (const scheme of ["dark", "light"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, timezoneId: "Europe/Oslo", colorScheme: scheme });
    await ctx.addCookies([{ name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url"), domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
    await page.goto(`${BASE}/training`);
    await page.getByRole("img", { name: /^Predicted .* time over time/ }).waitFor();
    await page.getByText("Coach, this morning").waitFor();
    results[`${scheme}: paces`] = (await page.getByRole("heading", { name: "Paces" }).count()) === 1;
    results[`${scheme}: this week`] = (await page.getByRole("heading", { name: "This week" }).count()) === 1;
    results[`${scheme}: swap offered`] = (await page.getByRole("button", { name: /Swap to easy/ }).count()) === 1;
    await page.screenshot({ path: `tests/smoke/out/60-health-training-${scheme}.png`, fullPage: true, caret: "initial" });
    await page.goto(`${BASE}/progress`);
    await page.getByRole("heading", { name: "Stamps" }).waitFor();
    results[`${scheme}: Japan stamp`] = (await page.getByText("Japan").count()) > 0;
    results[`${scheme}: easy pace at heart rate`] = (await page.getByText("Easy at 145 bpm").count()) === 1 && (await page.getByText(/^−12 s since /).count()) === 1;
    results[`${scheme}: globe`] = (await page.getByRole("img", { name: /Globe with the 2 countries/ }).count()) === 1;
    await page.waitForTimeout(600);
    await page.screenshot({ path: `tests/smoke/out/62-health-progress-${scheme}.png`, fullPage: true, caret: "initial" });
    await page.goto(`${BASE}/training`);
    await page.getByText("Coach, this morning").waitFor();
    if (scheme === "dark") {
      await page.goto(`${BASE}/today`);
      await page.getByText("kcal left today").waitFor();
      todayHasClock = (await page.getByRole("img", { name: /^Predicted .* time over time/ }).count()) > 0;
      await page.goto(`${BASE}/training`);
      await page.getByText("Coach, this morning").waitFor();
      await page.getByRole("link", { name: "Plan", exact: true }).click();
      await page.getByRole("heading", { name: "Plan", exact: true }).waitFor();
      results["plan page opens"] = (await page.getByText("Coming weeks").count()) + (await page.getByText("End plan").count()) > 0;
      await page.screenshot({ path: "tests/smoke/out/63-health-plan.png", fullPage: true, caret: "initial" });
      await page.goto(`${BASE}/training`);
      await page.getByText("Coach, this morning").waitFor();
    }
    if (scheme === "light") {
      await page.getByRole("button", { name: /Swap to easy/ }).click();
      await page.getByText("Swapped to an easy run").waitFor();
      await page.screenshot({ path: "tests/smoke/out/61-health-swapped.png", fullPage: true, caret: "initial" });
    }
    await ctx.close();
  }
  await browser.close();

  const [{ data: todays }, { data: note }] = await Promise.all([
    admin.from("planned_workouts").select("type, edited").eq("user_id", uid).eq("date", today),
    admin.from("daily_notes").select("alert, alert_done, source").eq("user_id", uid).eq("local_date", today).maybeSingle(),
  ]);
  Object.assign(results, {
    "note stored with sick alert": note?.alert === "sick",
    "alert handled": note?.alert_done === true,
    "today is easy now": todays?.[0]?.type === "easy" && todays?.[0]?.edited === true,
    "Today has no race clock": !todayHasClock,
    "no console errors": errors.length === 0,
  });
  console.log({ note, todays, errors });
  console.log(results);
  failed = Object.values(results).some((v) => !v);
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  await admin.auth.admin.deleteUser(uid);
}
process.exit(failed ? 1 : 0);
