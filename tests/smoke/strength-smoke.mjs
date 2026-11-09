// Strength (spec 2026-11-10): + → Strength opens today's session with Add exercise; a starred exercise and one
// logged before (sets filled in from last time, increase hint); kg typed in; ✓ folds it; Finish → This week shows
// the session; Progress shows Strength with the favourites. Dark and light.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { seedUser } from "./seed.mjs";

config({ path: "apps/web/.env.local" });
const BASE = process.argv[2] ?? "http://localhost:3100";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = (r) => {
  if (r.error) throw r.error;
  return r;
};
let failed = false;
const results = {};
const users = [];
try {
  const browser = await chromium.launch();
  const errors = [];
  for (const scheme of ["dark", "light"]) {
    const email = `strength+${scheme}-${Date.now()}@loop.test`, password = `S-${crypto.randomUUID()}`;
    const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const uid = c.user.id;
    users.push(uid);
    const { today } = await seedUser(admin, uid);
    const day = (n) => {
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    // Two earlier sessions: shoulder press 18 → 20 kg (so +2 kg is suggested), bench 60 kg; shoulder press starred.
    for (const [n, kg] of [[-14, 18], [-7, 20]]) {
      const { data: s } = must(await admin.from("strength_sessions").insert({ user_id: uid, local_date: day(n), finished_at: new Date().toISOString() }).select("id").single());
      must(
        await admin.from("strength_sets").insert([
          ...[1, 2, 3].map((set_no) => ({ user_id: uid, session_id: s.id, exercise_key: "shoulder-press", position: 0, set_no, reps: 10, kg })),
          ...[1, 2, 3].map((set_no) => ({ user_id: uid, session_id: s.id, exercise_key: "bench-press", position: 1, set_no, reps: 8, kg: 60 })),
        ]),
      );
    }
    must(await admin.from("user_exercises").insert({ user_id: uid, key: "shoulder-press", muscle_group: "shoulders", measure: "kg", favorite: true }));

    const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: s } = await anon.auth.signInWithPassword({ email, password });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, timezoneId: "Europe/Oslo", colorScheme: scheme });
    await ctx.addCookies([{ name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url"), domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
    const shot = (n, full = false) => page.screenshot({ path: `tests/smoke/out/70-strength-${n}-${scheme}.png`, fullPage: full, caret: "initial" });

    await page.goto(`${BASE}/today`);
    await page.getByRole("button", { name: "Log something" }).click();
    await page.getByRole("button", { name: /Strength/ }).waitFor();
    await shot("1-plus");
    await page.getByRole("button", { name: /Strength/ }).click();
    await page.waitForURL(/\/training\/strength\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    // A new session opens on Add exercise; favourites first with last time.
    await page.getByRole("dialog").getByText("Favourites").waitFor();
    results[`${scheme}: last time on a favourite`] = (await page.getByRole("dialog").getByText("Last: 3 × 10 at 20 kg").count()) === 1;
    await shot("2-picker");
    await page.getByRole("dialog").getByRole("button", { name: /Shoulder press/ }).click();
    await page.getByText("+2 kg: you did all reps last time").waitFor();
    results[`${scheme}: prefilled from last time`] = (await page.getByLabel("kg", { exact: true }).first().inputValue()) === "20";
    await page.getByText("+2 kg: you did all reps last time").click();
    results[`${scheme}: hint adds 2 kg`] = (await page.getByLabel("kg", { exact: true }).nth(2).inputValue()) === "22";
    await shot("3-session");
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByText("3 × 10 at 22 kg").waitFor();

    // Bench: type 62.5 in the first set; the sets that matched follow.
    await page.getByRole("button", { name: /Add exercise/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Bench press/ }).click();
    const kg1 = page.getByLabel("kg", { exact: true }).first();
    await kg1.fill("62.5");
    await kg1.blur();
    results[`${scheme}: typed kg carries down`] = (await page.getByLabel("kg", { exact: true }).nth(2).inputValue()) === "62.5";
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByText("3 × 8 at 62.5 kg").waitFor();
    await shot("4-folded", true);
    await page.getByRole("button", { name: "Finish" }).click();
    await page.waitForURL(/\/training$/, { timeout: 60_000 });
    await page.getByText("Shoulders, chest").waitFor({ timeout: 30_000 });
    results[`${scheme}: in This week`] = (await page.getByText("Strength", { exact: true }).count()) > 0;
    await shot("5-training", true);

    await page.goto(`${BASE}/progress`);
    await page.getByRole("heading", { name: "Strength" }).waitFor();
    results[`${scheme}: progress row`] = (await page.getByText(/^18 → 22 kg since /).count()) === 1;
    await shot("6-progress", true);

    if (scheme === "dark") {
      // Strength days in the plan: picked on the plan page, stored on the plan, no sessions sent anywhere.
      must(
        await admin
          .from("training_plans")
          .insert({ user_id: uid, goal_kind: "build", distance_km: 10, start_date: day(-7), generated_until: day(40), weekdays: [2, 4, 6], long_run_weekday: 6, runs_per_week: 3, vdot: 45, start_km_per_week: 25 }),
      );
      await page.goto(`${BASE}/training/plan`);
      await page.getByRole("button", { name: "+ Add strength days" }).click();
      const tomorrow = new Date(`${day(1)}T12:00:00Z`).getUTCDay();
      await page.getByRole("button", { name: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][tomorrow], exact: true }).last().click();
      await page.getByRole("button", { name: "Save days" }).click();
      await page.waitForTimeout(1500);
      const { data: plan } = await admin.from("training_plans").select("strength_weekdays").eq("user_id", uid).single();
      results["plan: strength day saved"] = JSON.stringify(plan.strength_weekdays) === JSON.stringify([tomorrow]);
      await shot("8-plan", true);
    }

    await page.goto(`${BASE}/today`);
    await page.getByText("Shoulders, chest").first().waitFor();
    results[`${scheme}: strength bib on Today`] = true;
    await shot("7-today");
    await ctx.close();

    const { data: sets } = await admin.from("strength_sets").select("exercise_key, kg").eq("user_id", uid).gte("created_at", new Date(Date.now() - 600_000).toISOString());
    results[`${scheme}: saved sets`] = (sets ?? []).filter((x) => x.exercise_key === "bench-press" && Number(x.kg) === 62.5).length === 3;
  }
  await browser.close();
  results["no console errors"] = errors.length === 0;
  console.log({ errors });
  console.log(results);
  failed = Object.values(results).some((v) => !v);
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id);
}
process.exit(failed ? 1 : 0);
