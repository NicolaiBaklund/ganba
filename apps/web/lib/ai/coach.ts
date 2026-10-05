import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const COACH_MODEL = process.env.AI_COACH_MODEL ?? "claude-opus-5-5";
const EFFORT = (process.env.AI_COACH_EFFORT ?? "high") as "low" | "medium" | "high" | "xhigh" | "max";

export interface CoachParams {
  system: string;
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
}
export interface CoachResponse {
  content: Anthropic.ContentBlock[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
}
/** One model call of the coach's tool loop. Tests pass a scripted fake. */
export interface CoachAi {
  create(apiKey: string, p: CoachParams): Promise<CoachResponse>;
}

export const anthropicCoachAi: CoachAi = {
  async create(apiKey, p) {
    const client = new Anthropic({ apiKey, maxRetries: 2 });
    return client.messages.create({
      model: COACH_MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: p.system, cache_control: { type: "ephemeral" } }],
      tools: p.tools,
      messages: p.messages,
      output_config: { effort: EFFORT },
    });
  },
};
