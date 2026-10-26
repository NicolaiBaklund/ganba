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
export interface CoachCallOpts {
  timeoutMs?: number;
  /** The reply tool's input JSON so far, while the model writes it (for streaming the answer). */
  onReplyDelta?: (partialJson: string) => void;
}
/** One model call of the coach's tool loop. Tests pass a scripted fake. */
export interface CoachAi {
  create(apiKey: string, p: CoachParams, opts?: CoachCallOpts): Promise<CoachResponse>;
}

export const anthropicCoachAi: CoachAi = {
  async create(apiKey, p, opts) {
    const client = new Anthropic({ apiKey, maxRetries: 2 });
    const stream = client.messages.stream(
      {
        model: COACH_MODEL,
        max_tokens: 16000,
        system: [{ type: "text", text: p.system, cache_control: { type: "ephemeral" } }],
        tools: p.tools,
        messages: p.messages,
        output_config: { effort: EFFORT },
      },
      opts?.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
    );
    // The reply tool's input arrives as JSON pieces: pass the growing text on so the answer can be shown live.
    const reply = new Map<number, string>();
    stream.on("streamEvent", (e) => {
      if (e.type === "content_block_start" && e.content_block.type === "tool_use" && e.content_block.name === "reply") reply.set(e.index, "");
      else if (e.type === "content_block_delta" && e.delta.type === "input_json_delta" && reply.has(e.index)) {
        const json = reply.get(e.index)! + e.delta.partial_json;
        reply.set(e.index, json);
        opts?.onReplyDelta?.(json);
      }
    });
    return stream.finalMessage();
  },
};
