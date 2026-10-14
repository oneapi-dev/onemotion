import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatError, chatStep, jsonStep } from "./llm";
import { describeProgress } from "./loop";

const reply = (content: string, tokens = 10) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: tokens, completion_tokens: 1 } }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

const failed = (status: number, error: string) => new Response(JSON.stringify({ error }), { status });

describe("chatStep", () => {
  it("tries a timed-out step again after a pause, and says so", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(failed(504, "OneAPI answered 504: The upstream provider timed out.")).mockResolvedValueOnce(reply("done"));
    vi.stubGlobal("fetch", fetch);
    const notes: string[] = [];
    const p = chatStep({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }], onRetry: (m) => notes.push(m) });
    await vi.advanceTimersByTimeAsync(4_000);
    expect((await p).text).toBe("done");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(notes[0]).toMatch(/504.*trying again in 4 s/);
    vi.useRealTimers();
  });

  it("gives up after three attempts", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => failed(503, "busy"));
    vi.stubGlobal("fetch", fetch);
    const p = chatStep({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }] }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await p).toBeInstanceOf(ChatError);
    expect(fetch).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("does not retry what will not pass: a bad key, no balance, a bad request", async () => {
    for (const status of [400, 401, 402]) {
      const fetch = vi.fn(async () => failed(status, "no"));
      vi.stubGlobal("fetch", fetch);
      await expect(chatStep({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }] })).rejects.toBeInstanceOf(ChatError);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
});

const ndjson = (lines: unknown[]) => new Response(lines.map((l) => `${JSON.stringify(l)}\n`).join(""), { status: 200, headers: { "Content-Type": "application/x-ndjson" } });

describe("chatStep over NDJSON", () => {
  it("reports progress while the model writes, then returns the answer", async () => {
    const answer = { choices: [{ message: { content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "write_file", arguments: '{"path":"scene/index.tsx"}' } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 9 } };
    vi.stubGlobal("fetch", vi.fn(async () => ndjson([{ type: "progress", chars: 1200, tool: "write_file", path: "scene/index.tsx" }, { type: "progress", chars: 4100, tool: "write_file", path: "scene/index.tsx" }, { type: "done", answer }])));
    const seen: number[] = [];
    const r = await chatStep({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }], onProgress: (p) => seen.push(p.chars) });
    expect(seen).toEqual([1200, 4100]);
    expect(r.toolCalls[0].function.name).toBe("write_file");
    expect(r.usage).toEqual({ prompt_tokens: 9 });
  });

  it("turns an error line into a retry for a broken upstream stream", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(ndjson([{ type: "progress", chars: 10 }, { type: "error", status: 502, error: "OneAPI: The upstream stream failed." }])).mockResolvedValueOnce(ndjson([{ type: "done", answer: { choices: [{ message: { content: "ok" } }] } }]));
    vi.stubGlobal("fetch", fetch);
    const p = chatStep({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }] });
    await vi.advanceTimersByTimeAsync(4_000);
    expect((await p).text).toBe("ok");
    vi.useRealTimers();
  });
});

describe("describeProgress", () => {
  it("says what the reply is doing", () => {
    expect(describeProgress({ chars: 4100, tool: "write_file", path: "scene/components/Pen.tsx" })).toBe("writing scene/components/Pen.tsx (4.1k characters)");
    expect(describeProgress({ chars: 0 })).toBe("thinking");
    expect(describeProgress({ chars: 300 })).toBe("writing its reply (300 characters)");
  });
});

describe("jsonStep", () => {
  it("never sends response_format, which OneAPI cannot carry to every provider", async () => {
    const fetch = vi.fn(async () => reply('{"ok": true}'));
    vi.stubGlobal("fetch", fetch);
    const r = await jsonStep<{ ok: boolean }>({ key: "k", model: "claude-sonnet-5.5", messages: [{ role: "user", content: "hi" }] });
    expect(r.value).toEqual({ ok: true });
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).not.toHaveProperty("response_format");
  });

  it("asks for web search only when the step should search", async () => {
    const fetch = vi.fn(async () => reply('{"ok": true}'));
    vi.stubGlobal("fetch", fetch);
    await jsonStep({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }], web: true });
    await jsonStep({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }] });
    const bodies = fetch.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies[0].web).toBe(true);
    expect(bodies[1]).not.toHaveProperty("web");
  });

  it("reads JSON inside a fence or prose", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply('Here it is:\n```json\n{"a": 1}\n```')));
    expect((await jsonStep<{ a: number }>({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }] })).value).toEqual({ a: 1 });
  });

  it("asks once more when the answer is not JSON, and counts both calls", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply("Sure! I will make a concept.", 10)).mockResolvedValueOnce(reply('{"title": "x"}', 20));
    vi.stubGlobal("fetch", fetch);
    const r = await jsonStep<{ title: string }>({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(r.value).toEqual({ title: "x" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(r.usage.prompt_tokens).toBe(30);
  });
});
