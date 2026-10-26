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
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
    const shot = (n) => page.screenshot({ path: `tests/smoke/out/coach-${scheme}-${n}.png`, fullPage: true });

    // The answer: stored like the real route does (so it is there after a reload), streamed back as NDJSON.
    await page.route("**/api/coach/messages", async (route) => {
      const body = route.request().postDataJSON();
      const { data: thread } = await admin.from("coach_threads").select("id").eq("user_id", uid).is("archived_at", null).single();
      await admin.from("coach_messages").insert({ thread_id: thread.id, user_id: uid, role: "user", text: body.text, options: [] });
      const { data: msg } = await admin.from("coach_messages").insert({ thread_id: thread.id, user_id: uid, role: "coach", text: ANSWER, options: [] }).select("*").single();
      const events = [
        { type: "start" },
        { type: "status", label: "Looking at your food log…" },
        { type: "text", text: ANSWER.slice(0, 30) },
        { type: "text", text: ANSWER },
        { type: "done", message: { id: msg.id, role: "coach", text: ANSWER, aboutWorkoutId: null, options: [], usedHealth: false, createdAt: msg.created_at } },
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
    await page.goto(`${BASE}/training`);
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
