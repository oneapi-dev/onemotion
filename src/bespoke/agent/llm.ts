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
/** Waits before the second and third attempt. */
const BACKOFF_MS = [4_000, 15_000];

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

/** A step, tried again after a pause when it fails for a reason that passes (timeouts, rate limits, a dropped connection). */
export async function chatStep(o: StepInput) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await chatOnce(o);
    } catch (err) {
      const transient = (err instanceof ChatError && TRANSIENT.has(err.status)) || (err instanceof TypeError && !o.signal?.aborted);
      if (!transient || attempt >= BACKOFF_MS.length) throw err;
      o.onRetry?.(`${err instanceof Error ? err.message : String(err)}: trying again in ${BACKOFF_MS[attempt] / 1000} s`);
      await wait(BACKOFF_MS[attempt], o.signal);
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

/** The JSON object in a model's reply, tolerating a fence or prose around it. */
export function parseJson<T>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model's answer had no JSON in it.");
  return JSON.parse(raw.slice(start, end + 1)) as T;
}

/**
 * A completion whose answer must be one JSON object: parsed leniently, and
 * asked for once more when the first answer is not JSON. Usage covers both
 * calls.
 */
export async function jsonStep<T>(o: StepInput): Promise<{ value: T; usage: Usage }> {
  const first = await chatStep(o);
  try {
    return { value: parseJson<T>(first.text), usage: first.usage };
  } catch {
    const again = await chatStep({
      ...o,
      messages: [...o.messages, { role: "assistant", content: first.text || "(no answer)" }, { role: "user", content: "That was not a valid JSON object. Reply with the JSON object only: no prose, no markdown fence." }],
    });
    const p = first.usage;
    const q = again.usage;
    const usage: Usage = {
      prompt_tokens: (p.prompt_tokens ?? 0) + (q.prompt_tokens ?? 0),
      completion_tokens: (p.completion_tokens ?? 0) + (q.completion_tokens ?? 0),
      prompt_tokens_details: { cached_tokens: (p.prompt_tokens_details?.cached_tokens ?? 0) + (q.prompt_tokens_details?.cached_tokens ?? 0) },
    };
    return { value: parseJson<T>(again.text), usage };
  }
}
