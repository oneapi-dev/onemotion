/** The OpenAI-style chat shapes the bespoke agent speaks, and one step through /api/chat. */

export type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type Msg =
  | { role: "system"; content: string }
  | { role: "user"; content: string | Part[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolSpec = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type Usage = { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };

export class ChatError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ChatError";
  }
}

type Choice = { message?: { content?: string | Part[] | null; tool_calls?: ToolCall[]; reasoning_content?: string }; finish_reason?: string };

/**
 * One completion: the reply's text, its tool calls and the tokens it used.
 * No response_format: OneAPI cannot carry it to every provider (Anthropic
 * models answer 400), so JSON is asked for in the prompt and parsed
 * leniently (see jsonStep).
 */
/** How far a reply has come while it streams: characters so far, the tool call being written and its file. */
export type StepProgress = { chars: number; tool?: string; path?: string; note?: string };

type StepInput = {
  key: string;
  model: string;
  messages: Msg[];
  tools?: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
  /** Let the model search and read the web on this step (OneAPI web search, billed per search). */
  web?: boolean;
  signal?: AbortSignal;
  onRetry?: (message: string) => void;
  onProgress?: (p: StepProgress) => void;
};

/** Statuses worth trying again: a rate limit, a provider that timed out or fell over, a gateway hiccup. */
export const TRANSIENT = new Set([429, 500, 502, 503, 504]);
/**
 * Waits before each new attempt. A model that is busy or briefly down
 * (429, 5xx) gets about two minutes in all; a step that timed out (504)
 * already took minutes, so it gets two more tries, then the agent loop
 * asks for smaller replies.
 */
const BACKOFF_MS = [4_000, 10_000, 20_000, 40_000, 60_000];
const TIMEOUT_RETRIES = 2;

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

/** A step, tried again after a pause when it fails for a reason that passes (a busy or unavailable model, a timeout, a dropped connection). */
export async function chatStep(o: StepInput) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await chatOnce(o);
    } catch (err) {
      const status = err instanceof ChatError ? err.status : 0;
      const transient = TRANSIENT.has(status) || (err instanceof TypeError && !o.signal?.aborted);
      const limit = status === 504 ? TIMEOUT_RETRIES : BACKOFF_MS.length;
      if (!transient || attempt >= limit) throw err;
      const ms = BACKOFF_MS[attempt];
      o.onRetry?.(`${err instanceof Error ? err.message : String(err)} Trying again in ${ms / 1000} s (attempt ${attempt + 2} of ${limit + 1}).`);
      o.onProgress?.({ chars: 0, note: `waiting ${ms / 1000} s to try again (attempt ${attempt + 2} of ${limit + 1}): ${status === 503 ? "the model is busy or briefly unavailable" : status === 429 ? "rate limited" : status === 504 ? "the provider timed out" : "the provider had a hiccup"}` });
      await wait(ms, o.signal);
    }
  }
}

async function chatOnce(o: StepInput) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-OneAPI-Key": o.key },
    body: JSON.stringify({
      model: o.model,
      messages: o.messages,
      tools: o.tools,
      temperature: o.temperature,
      max_tokens: o.maxTokens ?? 32_000,
      web: o.web || undefined,
    }),
    signal: o.signal,
  });
  type Answer = { error?: string | { message?: string }; choices?: Choice[]; usage?: Usage };
  let body: Answer | null = null;
  if ((res.headers.get("content-type") ?? "").includes("ndjson") && res.body) {
    // Progress lines while the model writes, then the answer or the error.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const line = (l: string) => {
      if (!l.trim()) return;
      const m = JSON.parse(l) as { type: string; answer?: Answer; status?: number; error?: string } & StepProgress;
      if (m.type === "progress") o.onProgress?.({ chars: m.chars, tool: m.tool, path: m.path, note: m.note });
      else if (m.type === "done") body = m.answer ?? null;
      else if (m.type === "error") throw new ChatError(m.status ?? 502, m.error ?? "The model step failed.");
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        line(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    line(buffer);
    if (!body) throw new ChatError(502, "The step ended without an answer.");
  } else {
    body = (await res.json().catch(() => null)) as Answer | null;
    if (!res.ok || !body) {
      const said = typeof body?.error === "string" ? body.error : body?.error?.message;
      throw new ChatError(res.status, said ?? `The model step failed (${res.status}).`);
    }
  }
  const answer: Answer = body;
  const choice = answer.choices?.[0];
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => (p.type === "text" ? p.text : "")).join("") : "";
  return { text, toolCalls: choice?.message?.tool_calls ?? [], usage: answer.usage ?? {}, finish: choice?.finish_reason ?? "" };
}

/** A reply that should have been JSON and was not, with the text around the place the parser stopped. */
export class JsonReplyError extends Error {
  constructor(
    message: string,
    public near?: string,
  ) {
    super(message);
    this.name = "JsonReplyError";
  }
}

const nextVisible = (s: string, from: number) => {
  for (let i = from; i < s.length; i++) if (!/\s/.test(s[i])) return s[i];
  return undefined;
};

/**
 * Fixes the slips models make in long JSON: a double quote inside a string
 * left unescaped, a raw line break inside a string, a comma before a closing
 * bracket. A quote ends a string only when what follows it could follow a
 * string (, : } ] or the end); any other quote is part of the text.
 */
export function repairJson(raw: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inString) {
      if (c === "\\") {
        out += c + (raw[i + 1] ?? "");
        i++;
      } else if (c === '"') {
        const next = nextVisible(raw, i + 1);
        if (next === undefined || ",:}]".includes(next)) {
          inString = false;
          out += c;
        } else out += '\\"';
      } else if (c === "\n") out += "\\n";
      else if (c === "\r") out += "\\r";
      else if (c === "\t") out += "\\t";
      else out += c;
      continue;
    }
    if (c === '"') inString = true;
    if (c === ",") {
      const next = nextVisible(raw, i + 1);
      if (next === "}" || next === "]") continue;
    }
    out += c;
  }
  return out;
}

/** The JSON object in a model's reply, tolerating a fence or prose around it and the usual slips inside it. */
export function parseJson<T>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new JsonReplyError("the answer had no JSON object in it");
  const json = raw.slice(start, end + 1);
  try {
    return JSON.parse(json) as T;
  } catch (err) {
    try {
      return JSON.parse(repairJson(json)) as T;
    } catch {
      const message = err instanceof Error ? err.message : String(err);
      const at = Number(/position (\d+)/.exec(message)?.[1]);
      throw new JsonReplyError(message, Number.isFinite(at) ? json.slice(Math.max(0, at - 80), at + 40) : undefined);
    }
  }
}

/**
 * A completion whose answer must be one JSON object: parsed leniently, and
 * asked for once more when the first answer is not JSON, saying what was
 * wrong (or with twice the room when the answer was cut off). Usage covers
 * both calls.
 */
export async function jsonStep<T>(o: StepInput): Promise<{ value: T; usage: Usage }> {
  const first = await chatStep(o);
  try {
    return { value: parseJson<T>(first.text), usage: first.usage };
  } catch (err) {
    const cut = first.finish === "length";
    const what = err instanceof JsonReplyError ? err.message : String(err);
    const near = err instanceof JsonReplyError && err.near ? ` The parser stopped here: «${err.near}».` : "";
    const ask = cut
      ? "Your answer was cut off before the JSON ended. Reply with the complete JSON object again, written more tightly (shorter strings, nothing extra): no prose, no markdown fence."
      : `That was not a valid JSON object (${what}).${near} Reply with the corrected JSON object only: no prose, no markdown fence. Write a double quote inside a string as \\".`;
    const again = await chatStep({
      ...o,
      maxTokens: cut ? Math.min(32_000, (o.maxTokens ?? 16_000) * 2) : o.maxTokens,
      messages: [...o.messages, { role: "assistant", content: first.text || "(no answer)" }, { role: "user", content: ask }],
    });
    const p = first.usage;
    const q = again.usage;
    const usage: Usage = {
      prompt_tokens: (p.prompt_tokens ?? 0) + (q.prompt_tokens ?? 0),
      completion_tokens: (p.completion_tokens ?? 0) + (q.completion_tokens ?? 0),
      prompt_tokens_details: { cached_tokens: (p.prompt_tokens_details?.cached_tokens ?? 0) + (q.prompt_tokens_details?.cached_tokens ?? 0) },
    };
    try {
      return { value: parseJson<T>(again.text), usage };
    } catch (second) {
      const said = second instanceof Error ? second.message : String(second);
      throw new JsonReplyError(`The model answered with broken JSON twice (${said}${again.finish === "length" ? ", cut off at the length limit" : ""}). Try again, or pick another model.`);
    }
  }
}
