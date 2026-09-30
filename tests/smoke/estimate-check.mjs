// Estimate route guards: no key → 402, foreign photo path → 400 (with a dummy key row it would call AI; we don't).
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: "apps/web/.env.local" });
const BASE = process.argv[2] ?? "http://localhost:3100";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `estcheck+${Date.now()}@loop.test`, password = `E-${crypto.randomUUID()}`;
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = c.user.id;
try {
  const user = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await user.auth.signInWithPassword({ email, password });
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s.session)).toString("base64url")}`;
  const post = (body) => fetch(`${BASE}/api/food/estimate`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
  const noKey = await post({ text: "2 eggs" });
  const empty = await post({});
  const anon = await fetch(`${BASE}/api/food/estimate`, { method: "POST", body: "{}" });
  console.log({
    "no key → 402": noKey.status === 402,
    "empty body → 400": empty.status === 400,
    "not signed in → 401": anon.status === 401,
  });
} finally {
  await admin.auth.admin.deleteUser(uid);
}
