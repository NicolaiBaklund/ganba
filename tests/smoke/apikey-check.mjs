// Checks BYOK safety: invalid key rejected, api_keys unreadable by users, key never echoed.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: "apps/web/.env.local" });
const BASE = process.argv[2] ?? "http://localhost:3100";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `keycheck+${Date.now()}@loop.test`, password = `K-${crypto.randomUUID()}`;
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = c.user.id;
try {
  const user = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await user.auth.signInWithPassword({ email, password });
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s.session)).toString("base64url")}`;
  const fake = "sk-ant-api03-" + "x".repeat(60) + "WXYZ";
  const res = await fetch(`${BASE}/api/settings/api-key`, { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ key: fake }) });
  const text = await res.text();
  await admin.from("api_keys").insert({ user_id: uid, ciphertext: "x", iv: "x", auth_tag: "x", last4: "abcd" });
  const { data: visible, error } = await user.from("api_keys").select("*");
  console.log({
    "invalid key → 400": res.status === 400 && text.includes("invalid_key"),
    "key not echoed": !text.includes(fake),
    "api_keys unreadable by user": (visible ?? []).length === 0,
    selectError: error?.message ?? null,
  });
} finally {
  await admin.auth.admin.deleteUser(uid);
}
