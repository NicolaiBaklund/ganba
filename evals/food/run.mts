// Food estimate eval. Costs real money — run deliberately.
// Usage: ANTHROPIC_API_KEY=... npx tsx evals/food/run.mts [--model claude-opus-5-5] [--effort medium]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  estimateTotals,
  FOOD_PROMPT_VERSION,
  FOOD_SYSTEM_PROMPT,
  FoodEstimateSchema,
  validateEstimate,
} from "../../packages/core/src/index.ts";

type Case = { id: string; text?: string; image?: string; expected: { kcal: number; protein_g?: number } };

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const model = arg("model", "claude-opus-5-5");
const effort = arg("effort", "medium") as "low" | "medium" | "high";
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
};

const cases: Case[] = JSON.parse(readFileSync("evals/food/cases.json", "utf8"));
const client = new Anthropic();
const results = [];
let totalCost = 0;

for (const c of cases) {
  const content: Anthropic.ContentBlockParam[] = [];
  if (c.image) {
    const data = readFileSync(`evals/food/${c.image}`).toString("base64");
    const mediaType = c.image.endsWith(".png") ? "image/png" : c.image.endsWith(".webp") ? "image/webp" : "image/jpeg";
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
  }
  content.push({ type: "text", text: c.text?.trim() || "(photo only)" });

  const started = Date.now();
  try {
    const res = await client.messages.parse({
      model,
      max_tokens: 16000,
      system: [{ type: "text", text: FOOD_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
      output_config: { effort, format: zodOutputFormat(FoodEstimateSchema) },
    });
    const est = res.parsed_output;
    const valid = est ? validateEstimate(est) : { ok: false as const, reason: "no_output" };
    const totals = est ? estimateTotals(est.items) : null;
    const price = PRICES[model] ?? [0, 0];
    const cost = (res.usage.input_tokens * price[0] + res.usage.output_tokens * price[1]) / 1e6;
    totalCost += cost;
    const errPct = totals ? ((totals.kcal - c.expected.kcal) / c.expected.kcal) * 100 : null;
    results.push({ id: c.id, expected: c.expected, totals, errPct, valid, cost, ms: Date.now() - started, items: est?.items });
    console.log(
      `${c.id.padEnd(18)} exp ${String(c.expected.kcal).padStart(5)}  got ${String(Math.round(totals?.kcal ?? NaN)).padStart(5)}  ` +
        `${errPct == null ? "  n/a" : `${errPct >= 0 ? "+" : ""}${errPct.toFixed(0)}%`.padStart(5)}  $${cost.toFixed(4)}` +
        (valid.ok ? "" : `  REJECTED by app (${valid.reason})`),
    );
  } catch (e) {
    results.push({ id: c.id, error: String(e) });
    console.log(`${c.id.padEnd(18)} ERROR ${String(e).slice(0, 120)}`);
  }
}

const errs = results.flatMap((r) => ("errPct" in r && r.errPct != null ? [Math.abs(r.errPct)] : []));
const mape = errs.reduce((s, x) => s + x, 0) / Math.max(1, errs.length);
console.log(`\nmodel ${model} · effort ${effort} · prompt v${FOOD_PROMPT_VERSION}`);
console.log(`mean abs error ${mape.toFixed(1)}% over ${errs.length} cases · total cost $${totalCost.toFixed(4)}`);

mkdirSync("evals/food/results", { recursive: true });
const file = `evals/food/results/${new Date().toISOString().slice(0, 10)}-${model}-${effort}-v${FOOD_PROMPT_VERSION}.json`;
writeFileSync(file, JSON.stringify({ model, effort, promptVersion: FOOD_PROMPT_VERSION, mape, totalCost, results }, null, 2));
console.log(`saved ${file}`);
