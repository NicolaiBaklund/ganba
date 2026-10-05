import "server-only";
import type { z } from "zod";
import { localDate, zonedTime } from "@loop/core";
import type { DB } from "@/lib/db/current";
import type { CreateEntry, UpdateEntry } from "@/lib/validation/food";

export class EntryError extends Error {
  constructor(
    readonly code: "invalid_input" | "not_found" | "db_error",
    readonly status: number,
  ) {
    super(code);
  }
}

const nameKey = (s: string) => s.trim().toLowerCase();

/** Fallback for clients that do not send alcohol_g: alcohol per item name from the AI estimate the entry was saved from. */
async function alcoholFromEstimate(supabase: DB, estimateId: string): Promise<Map<string, number>> {
  const { data } = await supabase.from("ai_estimates").select("response").eq("id", estimateId).maybeSingle();
  const items = (data?.response as { items?: { name?: string; alcohol_g?: number }[] } | null)?.items ?? [];
  return new Map(items.filter((i) => i.name && (i.alcohol_g ?? 0) > 0).map((i) => [nameKey(i.name!), Number(i.alcohol_g)]));
}

async function timezoneOf(supabase: DB, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("timezone").eq("user_id", userId).single();
  return data?.timezone ?? "UTC";
}

export async function createFoodEntry(supabase: DB, userId: string, b: z.output<typeof CreateEntry>): Promise<string> {
  if (b.photoPaths.some((p) => !p.startsWith(`${userId}/`))) throw new EntryError("invalid_input", 400);
  const tz = await timezoneOf(supabase, userId);
  const loggedAt = b.loggedAt ? new Date(b.loggedAt) : new Date();
  const day = b.localDate ?? localDate(tz, loggedAt);
  if (day > localDate(tz)) throw new EntryError("invalid_input", 400);

  const { data: entry, error } = await supabase
    .from("food_entries")
    .insert({ user_id: userId, logged_at: loggedAt.toISOString(), local_date: day, meal_type: b.mealType, source: b.source })
    .select("id")
    .single();
  if (error) throw new EntryError("db_error", 500);

  const alcohol = b.estimateId ? await alcoholFromEstimate(supabase, b.estimateId) : new Map<string, number>();
  const { error: itemsErr } = await supabase.from("food_items").insert(
    b.items.map((it) => ({ ...it, alcohol_g: it.alcohol_g ?? alcohol.get(nameKey(it.name)) ?? 0, user_id: userId, food_entry_id: entry.id })),
  );
  if (itemsErr) {
    await supabase.from("food_entries").delete().eq("id", entry.id);
    throw new EntryError("db_error", 500);
  }

  if (b.photoPaths.length) {
    await supabase.from("photos").insert(
      b.photoPaths.map((p) => ({ user_id: userId, bucket: "food" as const, storage_path: p, food_entry_id: entry.id })),
    );
  }
  if (b.estimateId) await supabase.from("ai_estimates").update({ food_entry_id: entry.id }).eq("id", b.estimateId);
  return entry.id;
}

/** The edit sheet sends each item's alcohol; older clients that do not keep it matched by name. */
export async function updateFoodEntry(supabase: DB, userId: string, id: string, b: z.output<typeof UpdateEntry>): Promise<void> {
  const { data: entry } = await supabase.from("food_entries").select("id, local_date").eq("id", id).maybeSingle();
  if (!entry) throw new EntryError("not_found", 404);

  const patch: { meal_type?: NonNullable<typeof b.mealType>; logged_at?: string } = {};
  if (b.mealType) patch.meal_type = b.mealType;
  if (b.time) patch.logged_at = zonedTime(entry.local_date, b.time, await timezoneOf(supabase, userId)).toISOString();
  if (patch.meal_type || patch.logged_at) {
    const { error } = await supabase.from("food_entries").update(patch).eq("id", id);
    if (error) throw new EntryError("db_error", 500);
  }

  if (b.items) {
    const { data: old } = await supabase.from("food_items").select("name, alcohol_g").eq("food_entry_id", id);
    const alcohol = new Map((old ?? []).map((o) => [nameKey(o.name), Number(o.alcohol_g)]));
    await supabase.from("food_items").delete().eq("food_entry_id", id);
    const { error } = await supabase
      .from("food_items")
      .insert(b.items.map((it) => ({ ...it, alcohol_g: it.alcohol_g ?? alcohol.get(nameKey(it.name)) ?? 0, user_id: userId, food_entry_id: id })));
    if (error) throw new EntryError("db_error", 500);
  }
}
