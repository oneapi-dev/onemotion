import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatError, chatStep, jsonStep, SchemaError, setBackupModel } from "./llm";
import { describeProgress } from "./loop";

/** A sent message's text, whether a string or parts (the last message carries a prompt-cache breakpoint). */
const textOf = (c: unknown): string => (typeof c === "string" ? c : Array.isArray(c) ? c.map((p: { text?: string }) => p.text ?? "").join("") : "");

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
    expect(notes[0]).toMatch(/504.*Trying again in 4 s \(attempt 2 of 3\)/);
    vi.useRealTimers();
  });

  it("waits about two minutes for a model that is busy or briefly unavailable, then gives up", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => failed(503, "OneAPI answered 503: That model is temporarily unavailable."));
    vi.stubGlobal("fetch", fetch);
    const waits: string[] = [];
    const p = chatStep({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }], onProgress: (x) => x.note && waits.push(x.note) }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(140_000);
    expect(await p).toBeInstanceOf(ChatError);
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(waits[2]).toMatch(/waiting 20 s .*attempt 4 of 6.*busy or briefly unavailable/);
    vi.useRealTimers();
  });

  it("tries a timed-out step only three times: it already took minutes", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => failed(504, "timed out"));
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

  it("goes on without web search when a step with it keeps failing", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(failed(502, "OneAPI answered 502: The upstream provider failed.")).mockResolvedValueOnce(failed(502, "again")).mockResolvedValueOnce(reply("done"));
    vi.stubGlobal("fetch", fetch);
    const notes: string[] = [];
    const p = chatStep({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }], web: true, onRetry: (m) => notes.push(m) });
    await vi.advanceTimersByTimeAsync(4_000);
    expect((await p).text).toBe("done");
    const bodies = fetch.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies.map((b) => b.web ?? false)).toEqual([true, true, false]);
    expect(notes.at(-1)).toMatch(/without web search/);
    vi.useRealTimers();
  });

  it("drops web search at once when the step is refused with it, but not for a bad key", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(failed(400, "web search is not available")).mockResolvedValueOnce(reply("done"));
    vi.stubGlobal("fetch", fetch);
    expect((await chatStep({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }], web: true })).text).toBe("done");
    expect(fetch).toHaveBeenCalledTimes(2);
    const bad = vi.fn(async () => failed(401, "no"));
    vi.stubGlobal("fetch", bad);
    await expect(chatStep({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }], web: true })).rejects.toBeInstanceOf(ChatError);
    expect(bad).toHaveBeenCalledTimes(1);
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

  it("repairs an unescaped quote, a raw line break and a trailing comma without asking again", async () => {
    const fetch = vi.fn(async () => reply('{"facts": ["The "Go" plan costs $2", "two\nlines",], "title": "x",}'));
    vi.stubGlobal("fetch", fetch);
    const r = await jsonStep<{ facts: string[]; title: string }>({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(r.value).toEqual({ facts: ['The "Go" plan costs $2', "two\nlines"], title: "x" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("tells the model what was wrong and where when it asks again", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply('{"beats": [{"says": "a"} {"says": "b"}]}')).mockResolvedValueOnce(reply('{"beats": []}'));
    vi.stubGlobal("fetch", fetch);
    await jsonStep({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }] });
    const again = JSON.parse((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    const ask = textOf(again.messages.at(-1).content);
    expect(ask).toMatch(/Expected ',' or ']' after array element/);
    expect(ask).toContain('{"says": "a"} {"says"');
  });

  it("asks again with more room when the answer was cut off", async () => {
    const cut = new Response(JSON.stringify({ choices: [{ message: { content: '{"beats": [{"says": "a"}, {"says": "b' }, finish_reason: "length" }], usage: {} }), { status: 200 });
    const fetch = vi.fn().mockResolvedValueOnce(cut).mockResolvedValueOnce(reply('{"beats": []}'));
    vi.stubGlobal("fetch", fetch);
    await jsonStep({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }], maxTokens: 8000 });
    const again = JSON.parse((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(again.max_tokens).toBe(16000);
    expect(textOf(again.messages.at(-1).content)).toMatch(/cut off/);
  });

  it("says plainly when the second answer is broken too", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply('{"beats": [{"says": "a"} {"says": "b"}]}')));
    await expect(jsonStep({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(/broken JSON twice.*Expected ',' or ']'/);
  });
});

describe("jsonStep with a validator", () => {
  const needsBeats = (v: unknown) => {
    const beats = (v as { beats?: unknown[] }).beats;
    if (!Array.isArray(beats) || !beats.length) throw new SchemaError(['"beats" is missing: the concept needs a list of beats.']);
    return v as { beats: unknown[]; title: string };
  };

  it("sends a parsed answer that does not fit back once, naming the problem, and keeps the fix", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply('{"title":"Kunci"}')).mockResolvedValueOnce(reply('{"title":"Kunci","beats":[{"says":"satu"}]}'));
    vi.stubGlobal("fetch", fetch);
    const r = await jsonStep({ key: "k", model: "m", messages: [{ role: "user", content: "concept" }] }, needsBeats);
    expect(r.value.beats).toHaveLength(1);
    expect(r.value.title).toBe("Kunci");
    const second = JSON.parse(fetch.mock.calls[1][1].body as string) as { messages: { content: unknown }[] };
    expect(textOf(second.messages.at(-1)?.content)).toMatch(/"beats" is missing.*\n.*keep everything else/s);
    expect(r.usage.prompt_tokens).toBe(20);
  });

  it("says a second miss is the model's output, not the brief", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply('{"title":"x"}')));
    await expect(jsonStep({ key: "k", model: "m", messages: [{ role: "user", content: "c" }] }, needsBeats)).rejects.toThrow(/not a problem with your brief/);
  });
});

describe("backup model", () => {
  it("hands a step whose provider keeps timing out to the backup, once", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const model = JSON.parse(String(init.body)).model as string;
        calls.push(model);
        return model === "backup-model" ? reply("done") : failed(504, "OneAPI answered 504: The upstream provider timed out.");
      }),
    );
    setBackupModel("backup-model");
    const notes: string[] = [];
    const p = chatStep({ key: "k", model: "main-model", messages: [{ role: "user", content: "hi" }], onRetry: (m) => notes.push(m) });
    await vi.runAllTimersAsync();
    const r = await p;
    setBackupModel(null);
    vi.useRealTimers();
    expect(r.text).toBe("done");
    expect(calls).toEqual(["main-model", "main-model", "main-model", "backup-model"]);
    expect(notes.at(-1)).toMatch(/goes to the backup model, backup-model/);
  });

  it("hands a request the provider cannot do (tool_choice) to the backup at once, without retries", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const model = JSON.parse(String(init.body)).model as string;
        calls.push(model);
        return model === "backup-model" ? reply("done") : failed(400, 'only `"auto"` is supported for `tool_choice`. `"none"`, `"required"`, and named function choices are not currently supported');
      }),
    );
    setBackupModel("backup-model");
    const r = await chatStep({ key: "k", model: "main-model", messages: [{ role: "user", content: "hi" }] });
    setBackupModel(null);
    expect(r.text).toBe("done");
    expect(calls).toEqual(["main-model", "backup-model"]);
  });
});
