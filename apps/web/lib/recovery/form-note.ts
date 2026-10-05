import "server-only";
import { createHash } from "node:crypto";
import { DayAnswerSchema, findingRefs, FORM_PROMPT_VERSION, formMessage, keepGrounded, RECOVERY_FORM_PROMPT, type DayAnswer, type ISODate } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";
import { anthropicRecoveryAi, type RecoveryAi } from "@/lib/ai/recovery";
import { todaysWorkout } from "@/lib/training/view";
import { gate, usageCols, verifiedFindings } from "./insights";
import { knownParts } from "./view";

const MAX_SENTENCES = 2;

/**
 * The AI line under today's Form (spec §5). Behind the health switch and the key; cached per day with a
 * fingerprint of the parts and the session, so it is only rewritten when today's numbers change.
 */
export async function formNote(userId: string, opts: { ai?: RecoveryAi; today?: ISODate } = {}) {
  const g = await gate(userId);
  if (!g.ok) return g;
  const date = opts.today ?? g.today;
  const db = createAdminSupabase();
  const { data: row } = await db.from("form_days").select("score, parts").eq("user_id", userId).eq("local_date", date).maybeSingle();
  if (!row || row.score == null) return { ok: false as const, error: "not_enough_data" as const };

  const parts = knownParts(row.parts).map((p) => ({ id: p.id, status: p.status, points: p.points, learned: p.learned, values: p.values }));
  const { workout: w } = await todaysWorkout(userId, date);
  const workout = w && w.status === "planned" ? { type: w.type, title: w.title } : null;
  const inputHash = createHash("sha256").update(`${FORM_PROMPT_VERSION}\n${g.language}\n${row.score}\n${JSON.stringify(parts)}\n${JSON.stringify(workout)}`).digest("hex");

  const { data: cached } = await db.from("recovery_day_answers").select("content, input_hash").eq("user_id", userId).eq("local_date", date).eq("question", "form").maybeSingle();
  if (cached && cached.input_hash === inputHash) return { ok: true as const, answer: cached.content as unknown as DayAnswer };

  const findings = await verifiedFindings(userId);
  const ai = opts.ai ?? anthropicRecoveryAi;
  const res = await ai.ask(g.apiKey, RECOVERY_FORM_PROMPT, formMessage({ language: g.language, date, score: row.score, parts, workout, findings }), DayAnswerSchema);
  if (!res.ok) return { ok: false as const, error: res.error };
  const allowed = new Set([...parts.filter((p) => p.status === "ok").map((p) => `part:${p.id}`), ...findingRefs(findings)]);
  const answer: DayAnswer = { sentences: keepGrounded(res.value.sentences, allowed, MAX_SENTENCES) };
  await db
    .from("recovery_day_answers")
    .upsert({ user_id: userId, local_date: date, question: "form", content: answer as unknown as Json, input_hash: inputHash, ...usageCols(res, FORM_PROMPT_VERSION) }, { onConflict: "user_id,local_date,question" });
  return { ok: true as const, answer };
}
