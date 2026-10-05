import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localDate, localHour } from "@loop/core";
import { createFoodEntry, updateFoodEntry } from "@/lib/food/entries";
import { CreateEntry, UpdateEntry } from "@/lib/validation/food";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";

describe("food entries: alcohol and meal time", () => {
  let u: TestUser;
  let today: string;
  let entryId: string;
  const tz = "Europe/Oslo";

  beforeAll(async () => {
    u = await createTestUser("food");
    ({ today } = await seedUser(admin(), u.id, { days: 2 }));
  });
  afterAll(cleanup);

  it("an AI log keeps the estimate's alcohol per item", async () => {
    const { data: est } = await u.client
      .from("ai_estimates")
      .insert({
        user_id: u.id,
        model: "test",
        prompt_version: 1,
        response: {
          items: [
            { name: "Beer", grams: 500, kcal: 215, protein_g: 2, carbs_g: 18, fat_g: 0, alcohol_g: 20, confidence: "high", assumptions: "" },
            { name: "Pizza", grams: 300, kcal: 800, protein_g: 30, carbs_g: 90, fat_g: 35, alcohol_g: 0, confidence: "medium", assumptions: "" },
          ],
          notes: "",
        },
      })
      .select("id")
      .single();
    entryId = await createFoodEntry(
      u.client,
      u.id,
      CreateEntry.parse({
        source: "ai",
        mealType: "dinner",
        estimateId: est!.id,
        items: [
          { name: "beer ", kcal: 215, protein_g: 2, carbs_g: 18, fat_g: 0 },
          { name: "Pizza", kcal: 800, protein_g: 30, carbs_g: 90, fat_g: 35 },
        ],
      }),
    );
    const { data: items } = await u.client.from("food_items").select("name, alcohol_g").eq("food_entry_id", entryId);
    const alcohol = Object.fromEntries(items!.map((i) => [i.name, Number(i.alcohol_g)]));
    expect(alcohol).toEqual({ beer: 20, Pizza: 0 }); // matched by name, case and spaces ignored
  });

  it("editing items without alcohol keeps it", async () => {
    await updateFoodEntry(u.client, u.id, entryId, UpdateEntry.parse({ items: [{ name: "Beer", kcal: 250, carbs_g: 20 }, { name: "Pizza", kcal: 700 }] }));
    const { data: items } = await u.client.from("food_items").select("name, kcal, alcohol_g").eq("food_entry_id", entryId);
    expect(Number(items!.find((i) => i.name === "Beer")!.alcohol_g)).toBe(20);
    expect(Number(items!.find((i) => i.name === "Beer")!.kcal)).toBe(250);
  });

  it("alcohol sent by the form wins over name matching (renamed or rescaled items keep it)", async () => {
    await updateFoodEntry(u.client, u.id, entryId, UpdateEntry.parse({ items: [{ name: "Pilsner 0.33", kcal: 140, alcohol_g: 13 }, { name: "Pizza", kcal: 700 }] }));
    const { data: items } = await u.client.from("food_items").select("name, alcohol_g").eq("food_entry_id", entryId);
    expect(Number(items!.find((i) => i.name === "Pilsner 0.33")!.alcohol_g)).toBe(13);
  });

  it("the meal time can be set on the entry's own date", async () => {
    await updateFoodEntry(u.client, u.id, entryId, UpdateEntry.parse({ time: "21:30" }));
    const { data: e } = await u.client.from("food_entries").select("logged_at, local_date").eq("id", entryId).single();
    const at = new Date(e!.logged_at);
    expect(localDate(tz, at)).toBe(e!.local_date);
    expect(localHour(tz, at)).toBe(21);
    expect(e!.local_date).toBe(today);
  });

  it("rejects a bad time", () => {
    expect(UpdateEntry.safeParse({ time: "25:00" }).success).toBe(false);
  });
});
