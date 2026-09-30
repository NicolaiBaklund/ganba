// Route-level checks for review fixes: token_hash login, past/future localDate, image media-type sniffing.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { seedUser } from "./seed.mjs";

config({ path: "apps/web/.env.local" });
const BASE = process.argv[2] ?? "http://localhost:3100";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `fixes+${Date.now()}@loop.test`, password = `F-${crypto.randomUUID()}`;
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = c.user.id;
let failed = false;
try {
  await seedUser(admin, uid, { days: 3 });

  // token_hash link works without any prior cookie (e.g. opened in another browser).
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const ok = await fetch(`${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=email`, { redirect: "manual" });
  const bad = await fetch(`${BASE}/auth/confirm?token_hash=nope&type=email`, { redirect: "manual" });
  const badCode = await fetch(`${BASE}/auth/callback?code=nope`, { redirect: "manual" });

  const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s.session)).toString("base64url")}`;
  const post = (url, body) => fetch(`${BASE}${url}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());
  const shift = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const item = [{ name: "Forgotten dinner", kcal: 700 }];
  const past = await post("/api/food/entries", { source: "quick", mealType: "dinner", localDate: shift(today, -1), items: item });
  const future = await post("/api/food/entries", { source: "quick", mealType: "dinner", localDate: shift(today, 2), items: item });
  const { data: pastRow } = await admin.from("food_entries").select("local_date").eq("user_id", uid).eq("local_date", shift(today, -1)).eq("meal_type", "dinner");

  // A PNG (as Safari would produce) must pass media-type sniffing and reach the AI call.
  // With a junk key the call then fails as invalid_key (401) instead of photo_missing (400).
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await admin.storage.from("food").upload(`${uid}/p.png`, png, { contentType: "image/png" });
  // Decryptable but invalid key: same AES-256-GCM scheme as apps/web/lib/ai/crypto.ts.
  const { createCipheriv, createHash, randomBytes } = await import("node:crypto");
  const k = createHash("sha256").update(process.env.API_KEY_ENCRYPTION_SECRET).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update("sk-ant-api03-invalid-key-for-tests-000000000000", "utf8"), cipher.final()]);
  await admin.from("api_keys").insert({ user_id: uid, ciphertext: ct.toString("base64"), iv: iv.toString("base64"), auth_tag: cipher.getAuthTag().toString("base64"), last4: "0000" });
  const est = await post("/api/food/estimate", { photoPaths: [`${uid}/p.png`] });
  await admin.storage.from("food").upload(`${uid}/x.webp`, Buffer.from("not an image"), { contentType: "image/webp" });
  const junk = await post("/api/food/estimate", { photoPaths: [`${uid}/x.webp`] });

  const checks = {
    "token_hash link → /today": ok.status >= 300 && ok.status < 400 && ok.headers.get("location")?.endsWith("/today"),
    "bad token_hash → /login?error=link": bad.headers.get("location")?.includes("/login?error=link"),
    "bad PKCE code → /login?error=link": badCode.headers.get("location")?.includes("/login?error=link"),
    "past-day entry accepted": past.status === 200 && pastRow?.length >= 2, // seeded dinner + forgotten dinner
    "future-day entry rejected": future.status === 400,
    [`PNG passes sniffing → reaches AI → invalid_key (got ${est.status})`]: est.status === 401,
    "non-image rejected as photo_missing": junk.status === 400,
  };
  console.log(checks);
  failed = Object.values(checks).some((v) => !v);
} finally {
  const { data: files } = await admin.storage.from("food").list(uid);
  if (files?.length) await admin.storage.from("food").remove(files.map((f) => `${uid}/${f.name}`));
  await admin.auth.admin.deleteUser(uid);
}
process.exit(failed ? 1 : 0);
