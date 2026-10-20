import { describe, expect, it } from "vitest";
import type { FilmState } from "@/bespoke/agent/run";
import { backupOf, recoverInterrupted, type Project } from "./store";

const project = (id: string, status?: FilmState["status"]): Project => ({ id, createdAt: "", brief: "b", website: "", format: "landscape", tone: "auto", site: null, ...(status ? { film: { status, files: { "scene/index.tsx": "x" }, modules: { "scene/index.tsx": "y" } } as unknown as FilmState } : {}) });

describe("recoverInterrupted", () => {
  it("marks a film the app was closed on, and keeps what it built", () => {
    const [a, b, c] = recoverInterrupted([project("a", "building"), project("b", "done"), project("c")]);
    expect(a.film?.status).toBe("stopped");
    expect(a.film?.interrupted).toBe(true);
    expect(a.film?.modules).toEqual({ "scene/index.tsx": "y" });
    expect(b.film?.interrupted).toBeUndefined();
    expect(c.film).toBeUndefined();
  });
});

describe("backup model", () => {
  const m = (id: string, input: string, output: string, caps = ["Chat", "Reasoning", "Vision"]) => ({ id, name: id, tagline: "", contextWindow: "1M", capabilities: caps, inputPrice: input, outputPrice: output, listInput: input, listOutput: output, currency: "USD", free: false });
  const catalog = [m("glm-5.3-flash", "0.075", "0.25"), m("muse-spark-1.3-contributor", "0.07", "0.14"), m("deepseek-v4.1-flash", "0.21", "0.84"), m("claude-sonnet-5.5", "1.4", "7"), m("text-only", "0.07", "0.2", ["Chat"])];

  it("picks the closest model in price that reads images", () => {
    expect(backupOf({}, "glm-5.3-flash", catalog)).toBe("muse-spark-1.3-contributor");
    expect(backupOf({}, "claude-sonnet-5.5", catalog)).toBe("deepseek-v4.1-flash");
  });

  it("follows the person's pick, or none", () => {
    expect(backupOf({ backupModel: "claude-sonnet-5.5" }, "glm-5.3-flash", catalog)).toBe("claude-sonnet-5.5");
    expect(backupOf({ backupModel: "none" }, "glm-5.3-flash", catalog)).toBeNull();
    expect(backupOf({}, "unknown-model", catalog)).toBeNull();
  });
});
