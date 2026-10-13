import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { chatStreamed, OneAPIError } = await import("./oneapi");

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

  it("takes a plain JSON answer from a gateway that ignored stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "plain" }, finish_reason: "stop" }], usage: {} }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const r = await chatStreamed("key", { model: "m", messages: [] }, AbortSignal.timeout(5000));
    expect(r.choices[0].message.content).toBe("plain");
  });
});
