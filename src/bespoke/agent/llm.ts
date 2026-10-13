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

/** One completion: the reply's text, its tool calls and the tokens it used. */
export async function chatStep(o: { key: string; model: string; messages: Msg[]; tools?: ToolSpec[]; temperature?: number; maxTokens?: number; json?: boolean; signal?: AbortSignal }) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-OneAPI-Key": o.key },
    body: JSON.stringify({
      model: o.model,
      messages: o.messages,
      tools: o.tools,
      temperature: o.temperature,
      max_tokens: o.maxTokens ?? 32_000,
      response_format: o.json ? { type: "json_object" } : undefined,
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
