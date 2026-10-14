import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { chatResilient, chatStreamed, OneAPIError, webSearch } = await import("./oneapi");

const sse = (events: unknown[]) =>
  new Response(events.map((e) => (e === "[DONE]" ? "data: [DONE]\n\n" : `data: ${JSON.stringify(e)}\n\n`)).join(""), { status: 200, headers: { "Content-Type": "text/event-stream" } });

afterEach(() => vi.unstubAllGlobals());

describe("chatStreamed", () => {
  it("asks OneAPI to stream with usage, and returns a non-streamed answer", async () => {
    const fetch = vi.fn(async () => sse([{ choices: [{ delta: { content: "Hello" } }] }, { choices: [{ delta: {}, finish_reason: "stop" }] }, { choices: [], usage: { prompt_tokens: 5, completion_tokens: 1 } }, "[DONE]"]));
    vi.stubGlobal("fetch", fetch);
    const r = await chatStreamed("key", { model: "claude-sonnet-5.5", messages: [] }, AbortSignal.timeout(5000));
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ model: "claude-sonnet-5.5", stream: true, stream_options: { include_usage: true } });
    expect(r.choices[0].message.content).toBe("Hello");
    expect(r.usage).toEqual({ prompt_tokens: 5, completion_tokens: 1 });
  });

  it("asks again without stream_options when the provider refuses them", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "stream_options cannot be converted to another protocol" } }), { status: 400 }))
      .mockResolvedValueOnce(sse([{ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }, "[DONE]"]));
    vi.stubGlobal("fetch", fetch);
    const r = await chatStreamed("key", { model: "m", messages: [] }, AbortSignal.timeout(5000));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).not.toHaveProperty("stream_options");
    expect(r.choices[0].message.content).toBe("ok");
  });

  it("passes a provider timeout through as a 504", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "The upstream provider timed out." } }), { status: 504 })));
    const err = await chatStreamed("key", { model: "m", messages: [] }, AbortSignal.timeout(5000)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OneAPIError);
    expect((err as InstanceType<typeof OneAPIError>).status).toBe(504);
    expect((err as Error).message).toMatch(/504: The upstream provider timed out/);
  });

  it("asks again without streaming when the stream breaks after it started", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(sse([{ choices: [{ delta: { content: "half" } }] }, { error: { message: "The upstream stream failed." } }]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "whole" }, finish_reason: "stop" }], usage: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const notes: string[] = [];
    const r = await chatResilient("key", { model: "m", messages: [] }, AbortSignal.timeout(5000), (p) => p.note && notes.push(p.note));
    expect(r.choices[0].message.content).toBe("whole");
    expect(JSON.parse((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).not.toHaveProperty("stream");
    expect(notes[0]).toMatch(/without streaming/);
  });

  it("takes a plain JSON answer from a gateway that ignored stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "plain" }, finish_reason: "stop" }], usage: {} }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const r = await chatStreamed("key", { model: "m", messages: [] }, AbortSignal.timeout(5000));
    expect(r.choices[0].message.content).toBe("plain");
  });
});

describe("webSearch", () => {
  const rpc = (result: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200, headers: { "Content-Type": "application/json" } });

  it("calls web_search on OneAPI's MCP server with the key, and returns the results' text", async () => {
    const fetch = vi.fn(async () => rpc({ content: [{ type: "text", text: "1. Cursor — https://cursor.com" }] }));
    vi.stubGlobal("fetch", fetch);
    const r = await webSearch("sk-oneapi-x", "cursor editor logo", 5, AbortSignal.timeout(5000));
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/v1\/mcp$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-oneapi-x");
    expect(JSON.parse(init.body as string)).toMatchObject({ jsonrpc: "2.0", method: "tools/call", params: { name: "web_search", arguments: { query: "cursor editor logo", num_results: 5 } } });
    expect(r).toEqual({ text: "1. Cursor — https://cursor.com", failed: false });
  });

  it("passes a failed search on as text, and a refused key as an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => rpc({ content: [{ type: "text", text: "Your balance is too low for web search." }], isError: true })));
    expect(await webSearch("k", "q", 3, AbortSignal.timeout(5000))).toEqual({ text: "Your balance is too low for web search.", failed: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid API key." } }), { status: 401 })));
    await expect(webSearch("k", "q", 3, AbortSignal.timeout(5000))).rejects.toBeInstanceOf(OneAPIError);
  });
});
