// Profile: activity → 0 lowers today's target by the training amount; delete account removes rows + files.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { seedUser } from "./seed.mjs";

config({ path: "apps/web/.env.local" });
const BASE = process.argv[2] ?? "http://localhost:3100";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `profile+${Date.now()}@loop.test`, password = `P-${crypto.randomUUID()}`;
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = c.user.id;
let failed = false;
try {
  await seedUser(admin, uid, { days: 5 });
  // A body photo + a food photo that must be gone after account deletion.
  const png = new Blob([Buffer.from("iVBORw0KGgo=", "base64")], { type: "image/webp" });
  await admin.storage.from("body").upload(`${uid}/a.webp`, png);
  await admin.storage.from("food").upload(`${uid}/b.webp`, png);

  const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, timezoneId: "Europe/Oslo" });
  await ctx.addCookies([{ name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url"), domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 3000)));

  const targetNow = async () => {
    await page.goto(`${BASE}/today`);
    const txt = await page.getByTestId("kcal-target").textContent();
    return Number(txt);
  };
  const before = await targetNow();

  await page.goto(`${BASE}/profile`);
  await page.screenshot({ path: "tests/smoke/out/30-profile.png", fullPage: true, caret: "initial" });
  await page.getByLabel("Running / week").fill("0");
  await page.getByRole("button", { name: "Save", exact: true }).nth(1).click();
  await page.getByText("Saved").first().waitFor();
  const after = await targetNow();

  await page.goto(`${BASE}/profile`);
  await page.getByPlaceholder("DELETE").fill("DELETE");
  await page.getByRole("button", { name: "Delete everything" }).click();
  await page.waitForURL(/login/, { timeout: 20000 });
  await browser.close();

  const [{ data: user }, { data: rows }, { data: bodyFiles }, { data: foodFiles }] = await Promise.all([
    admin.auth.admin.getUserById(uid),
    admin.from("weight_entries").select("id").eq("user_id", uid),
    admin.storage.from("body").list(uid),
    admin.storage.from("food").list(uid),
  ]);
  // 95 kg · 30 km · 0.9 / 7 ≈ 366 kcal of training removed
  const checks = {
    [`target dropped by ~training (${before} → ${after})`]: before - after > 300 && before - after < 420,
    "auth user deleted": !user?.user,
    "rows deleted": (rows ?? []).length === 0,
    "body files deleted": (bodyFiles ?? []).length === 0,
    "food files deleted": (foodFiles ?? []).length === 0,
    "no console errors": errors.length === 0,
  };
  console.log(checks);
  if (errors.length) console.log(errors);
  failed = Object.values(checks).some((v) => !v);
} finally {
  await admin.auth.admin.deleteUser(uid).catch(() => {});
}
process.exit(failed ? 1 : 0);
