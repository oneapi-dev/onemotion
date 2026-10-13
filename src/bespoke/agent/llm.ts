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
export async function chatStep(o: { key: string; model: string; messages: Msg[]; tools?: ToolSpec[]; temperature?: number; maxTokens?: number; signal?: AbortSignal }) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-OneAPI-Key": o.key },
    body: JSON.stringify({
      model: o.model,
      messages: o.messages,
      tools: o.tools,
      temperature: o.temperature,
      max_tokens: o.maxTokens ?? 32_000,
    }),
    signal: o.signal,
  });
  const body = (await res.json().catch(() => null)) as { error?: string | { message?: string }; choices?: Choice[]; usage?: Usage } | null;
  if (!res.ok || !body) {
    const said = typeof body?.error === "string" ? body.error : body?.error?.message;
    throw new ChatError(res.status, said ?? `The model step failed (${res.status}).`);
  }
  const choice = body.choices?.[0];
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => (p.type === "text" ? p.text : "")).join("") : "";
  return { text, toolCalls: choice?.message?.tool_calls ?? [], usage: body.usage ?? {}, finish: choice?.finish_reason ?? "" };
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
export async function jsonStep<T>(o: { key: string; model: string; messages: Msg[]; temperature?: number; maxTokens?: number; signal?: AbortSignal }): Promise<{ value: T; usage: Usage }> {
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
