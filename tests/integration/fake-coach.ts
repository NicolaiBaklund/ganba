import type { CoachAi, CoachCallOpts, CoachParams, CoachResponse } from "@/lib/ai/coach";

/** A scripted coach model: each call takes the next step and records what it was given. */
export type Step = (p: CoachParams, opts?: CoachCallOpts) => CoachResponse | Promise<CoachResponse>;
export class FakeCoach implements CoachAi {
  calls: CoachParams[] = [];
  script: Step[] = [];
  async create(_k: string, p: CoachParams, opts?: CoachCallOpts) {
    this.calls.push(JSON.parse(JSON.stringify(p)));
    const s = this.script.shift();
    if (!s) throw Object.assign(new Error("no script"), { status: 500 });
    return s(p, opts);
  }
}
export const usage = { input_tokens: 100, output_tokens: 20 };
export const tool = (name: string, input: unknown, id = `t-${name}-${Math.random()}`): CoachResponse => ({
  content: [{ type: "tool_use", id, name, input, caller: { type: "direct" } } as never],
  stop_reason: "tool_use",
  usage,
});
/** The context text the coach got (first message, a cached text block). */
export const ctxOf = (p: CoachParams) => {
  const c = p.messages[0]!.content;
  return typeof c === "string" ? c : (c as { text: string }[]).map((b) => b.text).join("");
};
