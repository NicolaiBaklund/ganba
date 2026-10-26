// Coach eval: fixed conversations against the real model, with the read tools answered from fixtures.
// Costs real money — run deliberately and read the answers yourself.
// Usage: ANTHROPIC_API_KEY=... npx tsx evals/coach/run.mts [--model claude-opus-5-5] [--case food-before-threshold]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { COACH_PROMPT_VERSION, COACH_SYSTEM_PROMPT } from "../../packages/core/src/index.ts";

type Case = { id: string; context: string; message: string; tools: Record<string, string> };

const arg = (name: string, fallback: string | null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const model = arg("model", "claude-opus-5-5")!;
const only = arg("case", null);
const cases: Case[] = (JSON.parse(readFileSync("evals/coach/cases.json", "utf8")) as Case[]).filter((c) => !only || c.id === only);

// Same names as the app's read tools; the answers come from the case's fixtures.
const range = { type: "object" as const, properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] };
const TOOLS: Anthropic.Tool[] = [
  { name: "food_log", description: "Meals per day in a date range, with day totals and today's targets.", input_schema: range },
  { name: "session", description: "A planned session (ref or date) with steps, and the matched activity's laps and heart rate.", input_schema: { type: "object", properties: { ref: { type: "string" }, date: { type: "string" } } } },
  { name: "activities", description: "All activities in a date range.", input_schema: range },
  { name: "recovery", description: "Sleep, HRV, resting HR and Form per day in a range.", input_schema: range },
  { name: "findings", description: "Links found in this person's own data.", input_schema: { type: "object", properties: {} } },
  { name: "weight", description: "Weight and trend in a range, with the goal.", input_schema: range },
  { name: "update_notes", description: "Add or remove coach notes (lasting facts).", input_schema: { type: "object", properties: { add: { type: "array" }, remove: { type: "array" } } } },
  {
    name: "reply",
    description: "Finish the turn: your message and 0–3 options.",
    input_schema: { type: "object", properties: { message: { type: "string" }, options: { type: "array" } }, required: ["message"] },
  },
];

const client = new Anthropic();
mkdirSync("evals/coach/out", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out: string[] = [`# Coach eval ${stamp} — ${model}, prompt v${COACH_PROMPT_VERSION}`, ""];

for (const c of cases) {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `${c.context}\n<message>${c.message}</message>` }];
  const used: string[] = [];
  let reply = "";
  for (let round = 0; round < 10 && !reply; round++) {
    const res = await client.messages.create({ model, max_tokens: 16000, system: COACH_SYSTEM_PROMPT, tools: TOOLS, messages });
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!uses.length) {
      reply = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
      break;
    }
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = uses.map((u) => {
      used.push(`${u.name}(${JSON.stringify(u.input)})`);
      if (u.name === "reply") reply = String((u.input as { message?: string }).message ?? "");
      return { type: "tool_result", tool_use_id: u.id, content: u.name === "reply" ? "ok" : (c.tools[u.name] ?? "No data.") };
    });
    messages.push({ role: "user", content: results });
  }
  out.push(`## ${c.id}`, "", `**Asked:** ${c.message}`, "", `**Tools:** ${used.join(", ") || "none"}`, "", reply, "");
  console.log(`${c.id}: ${used.length} tool calls`);
}
const file = `evals/coach/out/${stamp}.md`;
writeFileSync(file, out.join("\n"));
console.log(`answers written to ${file}`);
