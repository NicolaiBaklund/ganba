import "server-only";
import { after } from "next/server";
import type { CoachAi } from "@/lib/ai/coach";
import { runCoach, type CoachError } from "./run";
import type { CoachMessage } from "./store";

/** What the chat receives while the coach works: one JSON object per line. */
export type CoachEvent =
  | { type: "start" }
  | { type: "status"; label: string }
  /** The reply text so far (whole text, not a delta). */
  | { type: "text"; text: string }
  | { type: "done"; message: CoachMessage }
  | { type: "error"; error: CoachError };

const STATUS: Record<CoachError, number> = { no_key: 402, busy: 409, invalid_key: 401, unavailable: 503, refused: 422, invalid_output: 422 };

/**
 * The value of "message" in the reply tool's unfinished JSON, decoded as far as it goes ("" until it starts).
 * An escape cut in half at the end is left out until the rest arrives.
 */
export function partialReplyMessage(json: string): string {
  const key = json.search(/"message"\s*:\s*"/);
  if (key < 0) return "";
  let i = json.indexOf('"', json.indexOf(":", key) + 1) + 1;
  let out = "";
  const ESC: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" };
  while (i < json.length) {
    const ch = json[i]!;
    if (ch === '"') break;
    if (ch !== "\\") {
      out += ch;
      i++;
      continue;
    }
    const next = json[i + 1];
    if (next == null) break;
    if (next === "u") {
      const hex = json.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 6;
    } else {
      out += ESC[next] ?? next;
      i += 2;
    }
  }
  return out;
}

/**
 * One message to the coach as a streamed response (NDJSON of CoachEvent). Errors before the coach starts
 * (no key, busy) answer as JSON with a status code. The turn runs to the end and is stored even if the
 * client goes away; the request stays alive until then.
 */
export async function coachResponse(
  userId: string,
  input: { text: string; aboutWorkoutId?: string | null; aboutDate?: string | null },
  opts: { ai?: CoachAi } = {},
): Promise<Response> {
  const queue: CoachEvent[] = [];
  let push: (e: CoachEvent) => void = (e) => queue.push(e);
  let started!: () => void;
  const startedP = new Promise<"started">((r) => (started = () => r("started")));
  const result = runCoach(userId, input, {
    ai: opts.ai,
    onEvent: (e) => {
      if (e.type === "start") started();
      push(e);
    },
  });
  // Keep the request alive until the turn is stored, also when the client leaves (outside a request: no-op).
  try {
    after(() => result.then(() => undefined, () => undefined));
  } catch {}
  const first = await Promise.race([startedP, result]);
  if (first !== "started" && !first.ok) return Response.json({ error: first.error }, { status: STATUS[first.error] });

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (e: CoachEvent) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false; // the client went away; the coach keeps going
        }
      };
      for (const e of queue.splice(0)) send(e);
      push = send;
      void result
        .then((r) => send(r.ok ? { type: "done", message: r.message } : { type: "error", error: r.error }))
        .catch(() => send({ type: "error", error: "unavailable" }))
        .finally(() => {
          if (open) controller.close();
          open = false;
        });
    },
    cancel() {
      push = () => undefined;
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
