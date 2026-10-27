// Coach tab: five-item menu, a message whose answer streams in (status line, then growing text; the AI route is
// stubbed with an NDJSON stream so no model is called), the answer after a reload, "End plan" on Training,
// light and dark.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { seedUser } from "./seed.mjs";

config({ path: "apps/web/.env.local" });
const BASE = process.argv[2] ?? "http://localhost:3100";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `coach+${Date.now()}@loop.test`, password = `P-${crypto.randomUUID()}`;
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = c.user.id;
const checks = {};
const errors = [];
const ANSWER = "Go for a bowl of shoyu ramen with an extra egg: you are **40 g** short on protein today.";
try {
  await seedUser(admin, uid, { days: 10 });
  await admin.from("garmin_accounts").insert({ user_id: uid, ciphertext: "x", iv: "x", auth_tag: "x", last_synced_at: new Date().toISOString(), history_imported_at: new Date().toISOString() });
  // A key (encrypted like the app does) so the coach input shows; never used: the message route is stubbed.
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(process.env.API_KEY_ENCRYPTION_SECRET).digest(), iv);
  const ct = Buffer.concat([cipher.update("sk-ant-smoke-0000", "utf8"), cipher.final()]);
  await admin.from("api_keys").insert({ user_id: uid, provider: "anthropic", ciphertext: ct.toString("base64"), iv: iv.toString("base64"), auth_tag: cipher.getAuthTag().toString("base64"), last4: "0000" });

  const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const browser = await chromium.launch();
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 2, isMobile: true, colorScheme: scheme });
    await ctx.addCookies([{ name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url"), domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && !/status of 409/.test(m.text()) && errors.push(m.text().slice(0, 300))); // 409: the invalid-option step
    const shot = (n) => page.screenshot({ path: `tests/smoke/out/coach-${scheme}-${n}.png`, fullPage: true });

    // The answer: stored like the real route does (so it is there after a reload), streamed back as NDJSON.
    await page.route("**/api/coach/messages", async (route) => {
      const body = route.request().postDataJSON();
      const { data: thread } = await admin.from("coach_threads").select("id").eq("user_id", uid).is("archived_at", null).single();
      await admin.from("coach_messages").insert({ thread_id: thread.id, user_id: uid, role: "user", text: body.text, options: [] });
      const meta = { tools: ["food_log"], remembered: [`Lives in Tokyo (${scheme})`], forgot: [] };
      await admin.from("coach_notes").insert({ user_id: uid, text: `Lives in Tokyo (${scheme})`, source: "coach" });
      const { data: msg } = await admin.from("coach_messages").insert({ thread_id: thread.id, user_id: uid, role: "coach", text: ANSWER, options: [], meta }).select("*").single();
      const events = [
        { type: "start" },
        { type: "status", label: "Looking at your food log…" },
        { type: "text", text: ANSWER.slice(0, 30) },
        { type: "text", text: ANSWER },
        { type: "done", message: { id: msg.id, role: "coach", text: ANSWER, aboutWorkoutId: null, options: [], usedHealth: false, meta, createdAt: msg.created_at } },
      ];
      await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" });
    });

    await page.goto(`${BASE}/today`);
    const nav = page.locator("nav");
    checks[`${scheme}: menu has Coach, not Recovery`] = (await nav.getByRole("link", { name: "Coach" }).count()) === 1 && (await nav.getByRole("link", { name: "Recovery" }).count()) === 0;
    await nav.getByRole("link", { name: "Coach" }).click();
    await page.waitForURL(/\/coach/);
    await page.getByPlaceholder("Ask the coach").waitFor();
    await shot("1-empty");
    await page.getByPlaceholder("Ask the coach").fill(`What should I eat? (${scheme})`);
    await page.getByRole("button", { name: "Send" }).click();
    // Earlier answers fold into plain lines: only the newest has the bold number.
    await page.locator("b", { hasText: "40 g" }).waitFor().catch(() => null);
    checks[`${scheme}: streamed answer shown`] = (await page.locator("b", { hasText: "40 g" }).count()) > 0;
    await page.getByText("Checked your food log").last().waitFor({ timeout: 10_000 }).catch(() => null);
    checks[`${scheme}: ✓ line from the tools used`] = (await page.getByText("Checked your food log").count()) > 0;
    await page.getByText(`Remembered: Lives in Tokyo (${scheme})`).click();
    await page.getByText("Saved by the coach").first().waitFor({ timeout: 5000 }).catch(() => null);
    checks[`${scheme}: memory line opens the notes`] = (await page.getByText("Saved by the coach").count()) > 0;
    await shot("2-answer");
    await page.reload();
    await page.getByText("40 g").first().waitFor();
    checks[`${scheme}: answer there after reload`] = (await page.getByText(`What should I eat? (${scheme})`).count()) > 0;

    if (scheme === "light") {
      // A bad link (old or hand-edited session id) is dropped, and a stream that breaks before "done" still
      // shows the answer once it is stored.
      await page.unroute("**/api/coach/messages");
      let sentAbout = "unset";
      await page.route("**/api/coach/messages", async (route) => {
        const body = route.request().postDataJSON();
        sentAbout = body.aboutWorkoutId ?? null;
        const { data: thread } = await admin.from("coach_threads").select("id").eq("user_id", uid).is("archived_at", null).single();
        await admin.from("coach_messages").insert({ thread_id: thread.id, user_id: uid, role: "user", text: body.text, options: [] });
        // (A Supabase query only runs when awaited or then-ed.)
        setTimeout(() => admin.from("coach_messages").insert({ thread_id: thread.id, user_id: uid, role: "coach", text: "Answer after a **dropped** connection.", options: [] }).then(() => undefined), 1500);
        await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: [{ type: "start" }, { type: "status", label: "Looking at your food log…" }].map((e) => `${JSON.stringify(e)}\n`).join("") });
      });
      await page.goto(`${BASE}/coach?about=not-a-session`);
      await page.getByPlaceholder("Ask the coach").fill("Are you still there?");
      await page.getByRole("button", { name: "Send" }).click();
      await page.locator("b", { hasText: "dropped" }).waitFor({ timeout: 20_000 }).catch(() => null);
      checks["dropped stream: answer shows once stored"] = (await page.locator("b", { hasText: "dropped" }).count()) > 0;
      checks["bad session link is not sent"] = sentAbout === null;

      // A plan, so Training has "End plan" at the bottom.
      await page.goto(`${BASE}/training/new`);
      await page.getByRole("button", { name: "Build fitness" }).click();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByRole("button", { name: "Create plan" }).click({ timeout: 60_000 });
      await page.waitForURL(/\/training$/, { timeout: 60_000 });
    }
    // A plan change card: tap a changed day for its bib, then "Use this" folds it to one line. An old option
    // (cells without titles) shows the week without a bib. No warning lists anywhere.
    const { data: thread } = await admin.from("coach_threads").select("id").eq("user_id", uid).is("archived_at", null).single();
    const { data: plan } = await admin.from("training_plans").select("id").eq("user_id", uid).eq("status", "active").single();
    const { data: ws } = await admin.from("planned_workouts").select("id, date, type, title, planned_km, planned_duration_s, sport").eq("plan_id", plan.id).eq("status", "planned").order("date");
    // Not a Sunday: the day after must be in the same drawn week.
    const easy = ws.find((w) => (w.type === "easy" || w.type === "strides") && new Date(`${w.date}T12:00:00Z`).getUTCDay() !== 0);
    const to = new Date(`${easy.date}T12:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 1);
    const toDate = to.toISOString().slice(0, 10);
    const monday = new Date(`${easy.date}T12:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const days = (titles) =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setUTCDate(d.getUTCDate() + i);
        const date = d.toISOString().slice(0, 10);
        const cell = { type: "easy", sport: "run", km: Number(easy.planned_km), min: Math.round(easy.planned_duration_s / 60), done: false, ...(titles ? { title: easy.title, durationS: easy.planned_duration_s, fromDate: easy.date } : {}) };
        return { date, before: date === easy.date ? [cell] : [], after: date === toDate ? [cell] : [], changed: date === easy.date || date === toDate };
      });
    const option = (id, title, titles) => ({
      id, title, summary: "", status: "pending", lines: [], warnings: [{ code: "off_day", severity: "caution", date: toDate }],
      changes: [{ op: "move", workoutId: easy.id, toDate }], weeks: [{ monday: monday.toISOString().slice(0, 10), beforeKm: 30, afterKm: 30, days: days(titles) }],
    });
    await admin.from("coach_messages").insert({ thread_id: thread.id, user_id: uid, role: "user", text: `Move my easy run (${scheme})`, options: [] });
    await new Promise((r) => setTimeout(r, 20));
    await admin.from("coach_messages").insert({ thread_id: thread.id, user_id: uid, role: "coach", text: "Sure, the day after works.", options: [option(`new-${scheme}`, `Easy run a day later (${scheme})`, true)] });
    await new Promise((r) => setTimeout(r, 20));
    await admin.from("coach_messages").insert({ thread_id: thread.id, user_id: uid, role: "coach", text: "An older suggestion.", options: [option(`old-${scheme}`, `Old suggestion (${scheme})`, false)] });
    await page.goto(`${BASE}/coach`);
    const card = page.locator("div.rounded-xl", { hasText: `Easy run a day later (${scheme})` });
    await card.waitFor();
    await card.locator("button[aria-pressed]").nth((to.getUTCDay() + 6) % 7).click();
    await page.getByText(/^Was /).first().waitFor({ timeout: 5000 }).catch(() => null);
    checks[`${scheme}: tapped day shows its bib`] = (await card.getByText(/^Was /).count()) > 0;
    await page.waitForTimeout(400); // the bib opens over 200 ms
    await shot("4-plan-card");
    checks[`${scheme}: no warning lists`] = (await page.getByText(/not one of your running days/).count()) === 0;
    const old = page.locator("div.rounded-xl", { hasText: `Old suggestion (${scheme})` });
    await old.locator("button[aria-pressed]").nth((to.getUTCDay() + 6) % 7).click();
    checks[`${scheme}: old option without titles shows no bib, no crash`] = (await old.getByText("No details for this day.").count()) > 0;
    // An option that no longer fits (its session is gone): tapping it shows why, the card stays open.
    const gone = { ...option(`gone-${scheme}`, `Gone session (${scheme})`, true), changes: [{ op: "move", workoutId: crypto.randomUUID(), toDate }] };
    await admin.from("coach_messages").insert({ thread_id: thread.id, user_id: uid, role: "coach", text: "Another one.", options: [gone] });
    await page.reload();
    const goneCard = page.locator("div.rounded-xl", { hasText: `Gone session (${scheme})` });
    await goneCard.getByRole("button", { name: "Use this" }).click();
    await goneCard.getByText(/Can.t be applied/).waitFor({ timeout: 15_000 }).catch(() => null);
    checks[`${scheme}: invalid option shows why`] = (await goneCard.getByText(/Can.t be applied/).isVisible().catch(() => false)) === true;
    await card.getByRole("button", { name: "Use this" }).click();
    await card.getByText("Applied").waitFor({ timeout: 30_000 }).catch(() => null);
    checks[`${scheme}: Use this folds to one line`] = (await page.locator("div.rounded-xl", { hasText: `Easy run a day later (${scheme})` }).getByText("Applied").count()) > 0;

    await page.goto(`${BASE}/training`);
    await page.getByRole("button", { name: "End plan" }).waitFor({ timeout: 30_000 }).catch(() => null);
    checks[`${scheme}: no Coach button on Training`] = (await page.locator("main").getByRole("button", { name: "Coach", exact: true }).count()) === 0;
    checks[`${scheme}: End plan on Training`] = (await page.getByRole("button", { name: "End plan" }).count()) === 1;
    await shot("3-training");
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
