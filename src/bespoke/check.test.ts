import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { checkScene } = await import("./check");

/** The example scene's files, keyed as a model writes them (scene/...). */
function example(name: string): Record<string, string> {
  const root = path.join(__dirname, "examples", name);
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) files[path.relative(root, full).split(path.sep).join("/")] = readFileSync(full, "utf8");
    }
  };
  walk(path.join(root, "scene"));
  return files;
}

const minimal = (body: string, extra = "") =>
  `import { AbsoluteFill } from "remotion";\n${extra}\nexport const fonts = { Inter: ["400"] };\nexport const background = "#fff";\nexport default function Scene() {\n${body}\n  return <AbsoluteFill />;\n}\n`;

describe("checkScene", () => {
  it("passes the example and compiles every file to CommonJS", { timeout: 60_000 }, () => {
    const r = checkScene(example("gateway"));
    expect(r.errors).toEqual([]);
    expect(Object.keys(r.modules).sort()).toEqual(["scene/components/World.tsx", "scene/components/palette.ts", "scene/index.tsx"]);
    expect(r.modules["scene/index.tsx"]).toContain('require("@kit")');
  });

  it("rejects time, randomness, storage and foreign imports, and allows the network", { timeout: 60_000 }, () => {
    const r = checkScene({ "scene/index.tsx": minimal("  void fetch('https://x.test'); const n = Date.now() + Math.random() + localStorage.length;", 'import fs from "fs";') });
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).not.toMatch(/fetch/);
    expect(r.errors.join("\n")).toMatch(/"localStorage" is not available/);
    expect(r.errors.join("\n")).toMatch(/"Date" is not available/);
    expect(r.errors.join("\n")).toMatch(/Math.random/);
    expect(r.errors.join("\n")).toMatch(/import from "fs" is not allowed/);
  });

  it("reports type errors against the kit", { timeout: 60_000 }, () => {
    const r = checkScene({ "scene/index.tsx": minimal('  const x: number = prog(1, 0, 10, "fast");', 'import { prog } from "@kit";') });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.startsWith("scene/index.tsx:"))).toBe(true);
  });

  it("flags numbers on screen that the facts do not state", { timeout: 60_000 }, () => {
    const scene = minimal("", "").replace("return <AbsoluteFill />;", 'return <AbsoluteFill><div style={{ fontSize: 120 }}>Save 87% today</div><div>{"Step 3"}</div></AbsoluteFill>;');
    const r = checkScene({ "scene/index.tsx": scene }, "OneAPI: one key for every model.");
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/shows 87, which is not in the facts/);
    expect(r.errors.join("\n")).not.toMatch(/shows 120/);
    expect(checkScene({ "scene/index.tsx": scene }, "Save 87% on every request.").ok).toBe(true);
  });

  it("reads a CSS template string as style, not as words on screen, but still checks visible templates", { timeout: 60_000 }, () => {
    const scene = minimal("  const y = 108; const bg = `radial-gradient(70% 42% at 50% ${y}%, #222 0%, transparent 60%)`;", "").replace(
      "return <AbsoluteFill />;",
      "return <AbsoluteFill style={{ background: bg }}><div>{`Hemat 87% untuk ${y} model`}</div></AbsoluteFill>;",
    );
    const r = checkScene({ "scene/index.tsx": scene }, "OneAPI: one key for every model.");
    expect(r.errors.join("\n")).not.toMatch(/shows (60|70|42|50)\b/);
    expect(r.errors.join("\n")).toMatch(/shows 87, which is not in the facts/);
  });

  it("passes the example when its model names are in the facts", { timeout: 60_000 }, () => {
    const facts = "Models on OneAPI: claude-sonnet-5.5, gpt-6.1-sol, gemini-3.8-flash, deepseek-v4.1-flash. Base URL https://api.oneapi.id/v1";
    expect(checkScene(example("gateway"), facts).errors).toEqual([]);
  });

  it("passes the file pattern the agents learn from, beats and all", { timeout: 60_000 }, () => {
    const r = checkScene(example("pattern"), "Wayfare plans your whole trip in one place, from the apps you already use.");
    expect(r.errors).toEqual([]);
    expect(Object.keys(r.modules).sort()).toEqual(["scene/beats/b1.tsx", "scene/beats/b2.tsx", "scene/beats/b3.tsx", "scene/beats/index.ts", "scene/components/Headline.tsx", "scene/index.tsx", "scene/theme.ts"]);
  });

  it("refuses paths outside scene/", () => {
    const r = checkScene({ "scene/index.tsx": minimal(""), "../evil.ts": "" });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/files live in scene\//);
  });
});
