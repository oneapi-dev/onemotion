import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// A local image server stands in for the endpoint: allowed, as on the desktop app.
process.env.ONEMOTION_DESKTOP_SECRET = "test";

const { makeImage, sniff } = await import("./images");
const { OneAPIError } = await import("./oneapi");

const PNG = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
let server: Server;
let base = "";
const seen: { path: string; type: string; auth: string; body: string }[] = [];
let answer: { status: number; body: string } = { status: 200, body: "" };

const read = (req: IncomingMessage) => new Promise<string>((resolve) => {
  let s = "";
  req.on("data", (c: Buffer) => (s += c.toString("latin1")));
  req.on("end", () => resolve(s));
});

beforeAll(async () => {
  server = createServer(async (req, res) => {
    seen.push({ path: req.url ?? "", type: req.headers["content-type"] ?? "", auth: req.headers.authorization ?? "", body: await read(req) });
    res.writeHead(answer.status, { "Content-Type": "application/json" }).end(answer.body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/`;
});
afterAll(() => server.close());

const ask = (extra: Partial<Parameters<typeof makeImage>[0]> = {}) => makeImage({ base, key: "sk-nara", model: "gpt-image-2", prompt: "a red panda", size: "1024x1536", quality: "medium", signal: AbortSignal.timeout(5000), ...extra });

describe("image generation", () => {
  it("asks /images/generations for base64 and returns a data URL", async () => {
    answer = { status: 200, body: JSON.stringify({ data: [{ b64_json: PNG }] }) };
    const out = await ask({ negative: "blurry" });
    expect(out).toEqual({ data: `data:image/png;base64,${PNG}`, type: "image/png" });
    const req = seen.at(-1)!;
    expect(req.path).toBe("/v1/images/generations");
    expect(req.auth).toBe("Bearer sk-nara");
    expect(JSON.parse(req.body)).toEqual({ model: "gpt-image-2", prompt: "a red panda", negative_prompt: "blurry", n: 1, size: "1024x1536", quality: "medium", response_format: "b64_json" });
  });

  it("sends an edit to /images/edits as a form with the image", async () => {
    answer = { status: 200, body: JSON.stringify({ data: [{ b64_json: "/9j/AAAA" }] }) };
    const out = await ask({ prompt: "add a red hat", image: { type: "image/png", body: Buffer.from(PNG, "base64") } });
    expect(out.type).toBe("image/jpeg");
    const req = seen.at(-1)!;
    expect(req.path).toBe("/v1/images/edits");
    expect(req.type).toMatch(/^multipart\/form-data/);
    expect(req.body).toContain('name="image"; filename="image.png"');
    expect(req.body).toContain("add a red hat");
  });

  it("says what the endpoint refused, in words", async () => {
    answer = { status: 401, body: JSON.stringify({ error: { message: "invalid key" } }) };
    await expect(ask()).rejects.toThrow(/did not accept the image key \(invalid key\)/);
    answer = { status: 200, body: JSON.stringify({ data: [] }) };
    await expect(ask()).rejects.toBeInstanceOf(OneAPIError);
  });

  it("knows the image type from its first bytes", () => {
    expect(sniff("/9j/4AAQ")).toBe("image/jpeg");
    expect(sniff("UklGRiQ")).toBe("image/webp");
    expect(sniff(PNG)).toBe("image/png");
  });
});
