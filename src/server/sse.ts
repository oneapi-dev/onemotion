/**
 * Reassembles an OpenAI-style streamed chat completion (server-sent events)
 * into the shape a non-streamed one has: the message's text, its tool calls
 * (whose arguments arrive in pieces, by index), the finish reason and the
 * usage. Streaming keeps the connection to the provider busy, so a long
 * reply is not cut off as an idle request.
 */

type Delta = {
  content?: string | null;
  tool_calls?: { index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }[];
};
type Chunk = {
  choices?: { delta?: Delta; finish_reason?: string | null }[];
  usage?: Record<string, unknown> | null;
  error?: { message?: string; code?: number | string } | string;
};

export type Assembled = {
  choices: { message: { role: "assistant"; content: string; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }; finish_reason: string }[];
  usage: Record<string, unknown>;
};

export class StreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamError";
  }
}

export class SseAssembler {
  private buffer = "";
  private content = "";
  private tools = new Map<number, { id: string; name: string; args: string }>();
  private finish = "";
  private usage: Record<string, unknown> = {};
  done = false;

  /** Feeds raw text from the stream; complete lines are parsed, a partial line waits for the rest. */
  push(text: string) {
    this.buffer += text;
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl).replace(/\r$/, "");
      this.buffer = this.buffer.slice(nl + 1);
      this.line(line);
    }
  }

  private line(line: string) {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data) return;
    if (data === "[DONE]") {
      this.done = true;
      return;
    }
    let chunk: Chunk;
    try {
      chunk = JSON.parse(data) as Chunk;
    } catch {
      return;
    }
    if (chunk.error) throw new StreamError(typeof chunk.error === "string" ? chunk.error : (chunk.error.message ?? "The provider sent an error mid-reply."));
    if (chunk.usage) this.usage = chunk.usage;
    for (const c of chunk.choices ?? []) {
      if (c.finish_reason) this.finish = c.finish_reason;
      const d = c.delta;
      if (!d) continue;
      if (typeof d.content === "string") this.content += d.content;
      for (const t of d.tool_calls ?? []) {
        const i = t.index ?? 0;
        const cur = this.tools.get(i) ?? { id: "", name: "", args: "" };
        if (t.id) cur.id = t.id;
        if (t.function?.name) cur.name += t.function.name;
        if (t.function?.arguments) cur.args += t.function.arguments;
        this.tools.set(i, cur);
      }
    }
  }

  /** The completion so far, as a non-streamed response. */
  result(): Assembled {
    if (this.buffer.trim()) this.line(this.buffer.trim());
    const tools = [...this.tools.entries()]
      .sort(([a], [b]) => a - b)
      .map(([i, t]) => ({ id: t.id || `call_${i}`, type: "function" as const, function: { name: t.name, arguments: t.args } }));
    return {
      choices: [{ message: { role: "assistant", content: this.content, ...(tools.length ? { tool_calls: tools } : {}) }, finish_reason: this.finish || (tools.length ? "tool_calls" : "stop") }],
      usage: this.usage,
    };
  }
}
