import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMessages, fromResponses, modelIds, toMessages, toResponses, type ChatRequest } from "./translate";

vi.mock("server-only", () => ({}));

const request: ChatRequest = {
  model: "m",
  max_tokens: 500,
  messages: [
    { role: "system", content: "Be brief." },
    { role: "user", content: [{ type: "text", text: "Look:" }, { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } }] },
    { role: "assistant", content: "Checking.", tool_calls: [{ id: "c1", type: "function", function: { name: "check", arguments: '{"x":1}' } }] },
    { role: "tool", tool_call_id: "c1", content: "ok" },
    { role: "user", content: "And now?" },
  ],
  tools: [{ type: "function", function: { name: "check", description: "Checks.", parameters: { type: "object", properties: { x: { type: "number" } } } } }],
};

describe("translate", () => {
  it("turns a chat request into an Anthropic Messages request: system apart, tool results as user content, roles alternating", () => {
    const m = toMessages(request) as { system: string; messages: { role: string; content: Record<string, unknown>[] }[]; tools: { input_schema: unknown }[]; max_tokens: number };
    expect(m.system).toBe("Be brief.");
    expect(m.messages.map((x) => x.role)).toEqual(["user", "assistant", "user"]);
    expect(m.messages[0].content[1]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } });
    expect(m.messages[1].content[1]).toEqual({ type: "tool_use", id: "c1", name: "check", input: { x: 1 } });
    expect(m.messages[2].content).toEqual([{ type: "tool_result", tool_use_id: "c1", content: "ok" }, { type: "text", text: "And now?" }]);
    expect(m.tools[0].input_schema).toEqual(request.tools?.[0].function.parameters);
    expect(m.max_tokens).toBe(500);
  });

  it("turns a chat request into a Responses request", () => {
    const r = toResponses(request) as { instructions: string; input: Record<string, unknown>[]; max_output_tokens: number; tools: { name: string }[] };
    expect(r.instructions).toBe("Be brief.");
    expect(r.input[0]).toEqual({ role: "user", content: [{ type: "input_text", text: "Look:" }, { type: "input_image", image_url: "data:image/png;base64,QUJD" }] });
    expect(r.input[2]).toEqual({ type: "function_call", call_id: "c1", name: "check", arguments: '{"x":1}' });
    expect(r.input[3]).toEqual({ type: "function_call_output", call_id: "c1", output: "ok" });
    expect(r.tools[0].name).toBe("check");
    expect(r.max_output_tokens).toBe(500);
  });

  it("reads Messages and Responses answers back as chat answers, tool calls and usage included", () => {
    const a = fromMessages({ content: [{ type: "text", text: "Hi" }, { type: "tool_use", id: "t", name: "check", input: { x: 2 } }], stop_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 5 } });
    expect(a.choices[0].message.tool_calls?.[0].function).toEqual({ name: "check", arguments: '{"x":2}' });
    expect(a.choices[0].finish_reason).toBe("tool_calls");
    expect(a.usage).toEqual({ prompt_tokens: 15, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 5 } });
    const b = fromResponses({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [{ type: "message", content: [{ type: "output_text", text: "Part" }] }], usage: { input_tokens: 4, output_tokens: 9 } });
    expect(b.choices[0]).toEqual({ message: { role: "assistant", content: "Part" }, finish_reason: "length" });
  });

  it("reads model lists of either shape", () => {
    expect(modelIds({ data: [{ id: "a" }, { id: "b" }] })).toEqual(["a", "b"]);
    expect(modelIds({ models: [{ name: "c" }] })).toEqual(["c"]);
    expect(modelIds(["d"])).toEqual(["d"]);
  });
});

/** A fake provider: lists models, and answers only the API style it speaks. */
function fake(style: "chat" | "messages" | "hang" | "down" | "waf", needs: "bearer" | "x-api-key"): Promise<{ server: Server; base: string }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (style === "waf" && !req.headers["user-agent"]?.includes("Chrome/")) {
      res.writeHead(403, { "Content-Type": "text/html", "cf-mitigated": "challenge" });
      return res.end("<html>Attention Required</html>");
    }
    const authed = needs === "bearer" ? req.headers.authorization === "Bearer k" : req.headers["x-api-key"] === "k";
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (!authed) return json(401, { error: { message: "bad key" } });
    if (req.method === "GET" && req.url === "/v1/models") return json(200, { data: [{ id: "text-embedding-3" }, { id: "big-model" }, { id: "tiny-mini" }] });
    if (req.method === "POST" && req.url === "/v1/chat/completions" && (style === "chat" || style === "waf")) return json(200, { choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: {} });
    if (req.method === "POST" && req.url === "/v1/chat/completions" && style === "hang") return;
    if (req.method === "POST" && req.url === "/v1/chat/completions" && style === "down") return json(503, { error: { message: "no available channel for tiny-mini" } });
    if (req.method === "POST" && req.url === "/v1/messages" && style === "messages") return json(200, { content: [{ type: "text", text: "ok from messages" }], stop_reason: "end_turn", usage: { input_tokens: 3, output_tokens: 2 } });
    return json(404, { error: { message: "Not found" } });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })));
}

// The first test loads the server modules (undici and all): seconds while the rest of the suite runs beside it.
describe("detect and complete against real endpoints", { timeout: 20_000 }, () => {
  const servers: Server[] = [];
  beforeAll(() => {
    // The desktop app allows a model server on this machine; the web edition never does.
    process.env.ONEMOTION_DESKTOP_SECRET = "test";
  });
  afterAll(() => {
    delete process.env.ONEMOTION_DESKTOP_SECRET;
    for (const s of servers) s.close();
  });

  it("finds an OpenAI-compatible endpoint from a base URL without /v1", async () => {
    const { server, base } = await fake("chat", "bearer");
    servers.push(server);
    const { detect } = await import("./provider");
    const d = await detect(base, "k", AbortSignal.timeout(10_000));
    expect(d).toEqual({ base: `${base}/v1`, api: "chat", auth: "bearer", models: ["big-model", "tiny-mini", "text-embedding-3"] });
  });

  it("finds an Anthropic-style endpoint and talks to it in chat shape", async () => {
    const { server, base } = await fake("messages", "x-api-key");
    servers.push(server);
    const { detect, complete } = await import("./provider");
    const d = await detect(`${base}/v1`, "k", AbortSignal.timeout(10_000));
    expect(d.api).toBe("messages");
    expect(d.auth).toBe("x-api-key");
    const a = await complete({ name: "fake", base: d.base, api: d.api, auth: d.auth, custom: true }, "k", { model: "big-model", messages: [{ role: "user", content: "hi" }] }, AbortSignal.timeout(10_000));
    expect(a.choices[0].message.content).toBe("ok from messages");
  });

  it("keeps the model list when the test request hangs, and takes the path that held it open as the API", async () => {
    const { server, base } = await fake("hang", "bearer");
    servers.push(server);
    const { detect } = await import("./provider");
    const d = await detect(`${base}/v1`, "k", AbortSignal.timeout(10_000), 300);
    expect(d.api).toBe("chat");
    expect(d.models).toEqual(["big-model", "tiny-mini", "text-embedding-3"]);
    expect(d.warning).toMatch(/listed 3 models and speaks \/chat\/completions, but the test request to tiny-mini took over 0.3s to answer/);
    server.closeAllConnections();
  });
  it("stays on an API that is there when only the test model fails, quoting the endpoint's error", async () => {
    const { server, base } = await fake("down", "bearer");
    servers.push(server);
    const { detect } = await import("./provider");
    const d = await detect(`${base}/v1`, "k", AbortSignal.timeout(10_000));
    expect(d.api).toBe("chat");
    expect(d.warning).toMatch(/speaks \/chat\/completions, but the test request to tiny-mini answered 503: no available channel for tiny-mini/);
  });

  it("asks again as a browser when a firewall blocks the studio's User-Agent", async () => {
    const { server, base } = await fake("waf", "bearer");
    servers.push(server);
    const { detect } = await import("./provider");
    const d = await detect(`${base}/v1`, "k", AbortSignal.timeout(10_000));
    expect(d).toEqual({ base: `${base}/v1`, api: "chat", auth: "bearer", models: ["big-model", "tiny-mini", "text-embedding-3"] });
  });

  it("sends Claude its prompt-cache marks, and asks again without them when a provider refuses them", async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen.push(body);
        res.writeHead(body.includes("cache_control") ? 400 : 200, { "Content-Type": "application/json" });
        res.end(body.includes("cache_control") ? JSON.stringify({ error: { message: "messages.0.content.0.cache_control: Extra inputs are not permitted" } }) : JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: {} }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    servers.push(server);
    const { complete } = await import("./provider");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
    const messages = [{ role: "system", content: [{ type: "text", text: "Be brief.", cache_control: { type: "ephemeral" } }] }, { role: "user", content: "hi" }];
    const a = await complete({ name: "fake", base, api: "chat", auth: "bearer", custom: true }, "k", { model: "claude-sonnet-5-5", messages }, AbortSignal.timeout(10_000));
    expect(a.choices[0].message.content).toBe("ok");
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain("cache_control");
    expect(JSON.parse(seen[1]).messages[0].content).toBe("Be brief.");
    // A model that caches on its own never gets them.
    seen.length = 0;
    await complete({ name: "fake", base, api: "chat", auth: "bearer", custom: true }, "k", { model: "deepseek-v4", messages }, AbortSignal.timeout(10_000));
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toContain("cache_control");
  });

  it("refuses a private address on the web edition", async () => {
    delete process.env.ONEMOTION_DESKTOP_SECRET;
    const { detect } = await import("./provider");
    await expect(detect("http://127.0.0.1:9/v1", "k", AbortSignal.timeout(5_000))).rejects.toThrow(/private network/);
    process.env.ONEMOTION_DESKTOP_SECRET = "test";
  });
});
