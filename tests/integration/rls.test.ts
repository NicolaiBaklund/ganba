import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";

describe("row level security", () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    a = await createTestUser("a");
    b = await createTestUser("b");
  });
  afterAll(cleanup);

  it("user B cannot read or change user A's weights", async () => {
    const { data: row } = await a.client
      .from("weight_entries")
      .insert({ user_id: a.id, measured_at: new Date().toISOString(), local_date: "2026-10-01", weight_kg: 80 })
      .select("id")
      .single();
    expect(row?.id).toBeTruthy();

    const { data: seen } = await b.client.from("weight_entries").select("*");
    expect(seen).toEqual([]);

    await b.client.from("weight_entries").delete().eq("id", row!.id);
    const { data: still } = await admin().from("weight_entries").select("id").eq("id", row!.id);
    expect(still).toHaveLength(1);
  });

  it("user B cannot insert rows as user A", async () => {
    const { error } = await b.client
      .from("food_entries")
      .insert({ user_id: a.id, logged_at: new Date().toISOString(), local_date: "2026-10-01", meal_type: "lunch", source: "quick" });
    expect(error).not.toBeNull();
  });

  it("api_keys is unreadable for signed-in users, even their own row", async () => {
    await admin().from("api_keys").insert({ user_id: a.id, ciphertext: "x", iv: "x", auth_tag: "x", last4: "abcd" });
    const { data } = await a.client.from("api_keys").select("*");
    expect(data ?? []).toEqual([]);
  });

  it("storage: user B cannot download or delete user A's photo", async () => {
    const path = `${a.id}/it.webp`;
    const { error: upErr } = await a.client.storage.from("body").upload(path, new Blob(["x"]), { contentType: "image/webp" });
    expect(upErr).toBeNull();

    const { error: dlErr } = await b.client.storage.from("body").download(path);
    expect(dlErr).not.toBeNull();

    await b.client.storage.from("body").remove([path]);
    const { data: files } = await admin().storage.from("body").list(a.id);
    expect(files?.map((f) => f.name)).toContain("it.webp");
  });

  it("storage: users cannot upload into someone else's folder", async () => {
    const { error } = await b.client.storage.from("food").upload(`${a.id}/intruder.webp`, new Blob(["x"]), { contentType: "image/webp" });
    expect(error).not.toBeNull();
  });
});
