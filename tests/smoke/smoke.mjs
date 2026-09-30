// Browser smoke run against a running app (default http://localhost:3100).
// Creates a throwaway user, walks the main flows, saves screenshots to tests/smoke/out, deletes the user.
// Usage: node tests/smoke/smoke.mjs [baseUrl]
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

config({ path: "apps/web/.env.local" });
const BASE = process.argv[2] ?? "http://localhost:3100";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(URL_).hostname.split(".")[0];
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const email = `smoke+${Date.now()}@loop.test`;
const password = `Smoke-${crypto.randomUUID()}`;
const shots = [];
const shot = async (page, name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `tests/smoke/out/${name}.png`, fullPage: true });
  shots.push(name);
};

// @supabase/ssr cookie format: "base64-" + base64url(JSON session), chunked at 3180 chars.
function sessionCookies(session) {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const name = `sb-${ref}-auth-token`;
  const size = 3180;
  if (value.length <= size) return [{ name, value }];
  const chunks = [];
  for (let i = 0; i * size < value.length; i++) chunks.push({ name: `${name}.${i}`, value: value.slice(i * size, (i + 1) * size) });
  return chunks;
}

const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (createErr) throw createErr;
const uid = created.user.id;
let failed = null;

try {
  const { data: signIn, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    timezoneId: "Europe/Oslo",
    locale: "en-GB",
  });
  await context.addCookies(
    sessionCookies(signIn.session).map((c) => ({ ...c, domain: "localhost", path: "/", sameSite: "Lax" })),
  );
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 600)));

  // Onboarding
  await page.goto(`${BASE}/today`);
  await page.waitForURL(/onboarding/);
  await shot(page, "01-onboarding-body");
  await page.getByRole("button", { name: "Male", exact: true }).click();
  await page.locator("#birth").fill("2004-03-15");
  await page.getByLabel("Height").fill("193");
  await page.getByLabel("Current weight").fill("95");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Running per week").fill("30");
  await shot(page, "02-onboarding-activity");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Target weight").fill("88");
  await shot(page, "03-onboarding-goal");
  await page.getByRole("button", { name: "Continue" }).click();
  await shot(page, "04-onboarding-result");
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/today/);
  await shot(page, "05-today-empty");

  // Quick add
  await page.getByRole("button", { name: "Log something" }).click();
  await shot(page, "06-plus-menu");
  await page.getByRole("button", { name: /Quick add/ }).click();
  await page.getByLabel("Calories").fill("650");
  await shot(page, "07-quick-add");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByText("650").first().waitFor();

  // Weight
  await page.getByRole("button", { name: "Log something" }).click();
  await page.getByRole("button", { name: /Weight/ }).click();
  await page.getByLabel("Weight", { exact: true }).fill("94,6");
  await page.locator('input[type="file"]').setInputFiles("apps/web/public/icon-512.png");
  await page.locator("img").first().waitFor();
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Weight saved").waitFor({ timeout: 20000 });
  await shot(page, "08-today-logged");

  await page.goto(`${BASE}/body`);
  await shot(page, "09-body");

  // AI logging UI: no key banner, then with a dummy key row and a mocked estimate response.
  await page.goto(`${BASE}/food/log?mode=text`);
  await page.getByText("AI logging needs your Anthropic API key.").waitFor();
  await shot(page, "10-foodlog-nokey");
  await admin.from("api_keys").insert({ user_id: uid, ciphertext: "x", iv: "x", auth_tag: "x", last4: "test" });
  await page.route("**/api/food/estimate", (route) =>
    route.fulfill({
      json: {
        estimateId: null,
        estimate: {
          notes: "Sauce amount is a guess.",
          items: [
            { name: "Spaghetti, cooked", grams: 250, kcal: 395, protein_g: 14.5, carbs_g: 77, fat_g: 2.3, confidence: "medium", assumptions: "Assumed a normal plate." },
            { name: "Bolognese sauce", grams: 200, kcal: 300, protein_g: 20, carbs_g: 12, fat_g: 19, confidence: "low", assumptions: "Beef mince, some oil." },
          ],
        },
        totals: { kcal: 695, proteinG: 34.5, carbsG: 89, fatG: 21.3 },
      },
    }),
  );
  await page.goto(`${BASE}/food/log?mode=text`);
  await page.getByPlaceholder(/Describe it/).fill("spaghetti bolognese");
  await page.getByRole("button", { name: "Estimate" }).click();
  await page.getByText("Bolognese sauce").first().waitFor().catch(() => {});
  await page.locator('input[value="Bolognese sauce"]').waitFor();
  await shot(page, "11-foodlog-review");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/today/);
  await shot(page, "12-today-after-ai");

  // Delete the weigh-in that has the photo; its file must disappear from storage.
  const { data: photoRows } = await admin.from("photos").select("storage_path, weight_entry_id").eq("user_id", uid);
  const photoPath = photoRows?.[0]?.storage_path;
  const del = photoRows?.[0] ? await page.request.delete(`${BASE}/api/weight/${photoRows[0].weight_entry_id}`) : null;
  const { data: left } = await admin.storage.from("body").list(uid);
  await browser.close();

  // DB assertions
  const [{ data: entries }, { data: weights }, { data: plans }] = await Promise.all([
    admin.from("food_entries").select("local_date, source, food_items(kcal)").eq("user_id", uid).order("created_at"),
    admin.from("weight_entries").select("weight_kg").eq("user_id", uid),
    admin.from("energy_plans").select("base_expenditure_kcal").eq("user_id", uid),
  ]);
  const osloToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());
  const checks = {
    "2 food entries (quick + ai)": entries?.length === 2,
    "ai entry has 2 items": entries?.[1]?.source === "ai" && entries?.[1]?.food_items?.length === 2,
    "entry on Oslo local date": entries?.[0]?.local_date === osloToday,
    "650 kcal item": Number(entries?.[0]?.food_items?.[0]?.kcal) === 650,
    "1 weight left (onboarding; logged one deleted)": weights?.length === 1,
    "body photo uploaded + linked": !!photoPath,
    "delete weight → 200": del?.ok() === true,
    "photo file removed on delete": (left ?? []).length === 0,
    "no console/hydration errors": consoleErrors.length === 0,
    "energy plan created": plans?.length === 1,
  };
  console.log(checks);
  if (consoleErrors.length) console.log("console errors:", consoleErrors);
  if (Object.values(checks).some((v) => !v)) failed = new Error("checks failed");
} catch (e) {
  failed = e;
} finally {
  for (const bucket of ["food", "body"]) {
    const { data: files } = await admin.storage.from(bucket).list(uid, { limit: 1000 });
    if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${uid}/${f.name}`));
  }
  await admin.auth.admin.deleteUser(uid);
  console.log("screenshots:", shots.join(", "));
}
if (failed) {
  console.error(failed);
  process.exit(1);
}
