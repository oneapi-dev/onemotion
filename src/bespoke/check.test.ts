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

  it("rejects network, time, randomness and foreign imports", { timeout: 60_000 }, () => {
    const r = checkScene({ "scene/index.tsx": minimal("  fetch('https://x.test'); const n = Date.now() + Math.random();", 'import fs from "fs";') });
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/"fetch" is not available/);
    expect(r.errors.join("\n")).toMatch(/"Date" is not available/);
    expect(r.errors.join("\n")).toMatch(/Math.random/);
    expect(r.errors.join("\n")).toMatch(/import from "fs" is not allowed/);
  });

  it("reports type errors against the kit", { timeout: 60_000 }, () => {
    const r = checkScene({ "scene/index.tsx": minimal('  const x: number = prog(1, 0, 10, "fast");', 'import { prog } from "@kit";') });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.startsWith("scene/index.tsx:"))).toBe(true);
  });

  it("refuses paths outside scene/", () => {
    const r = checkScene({ "scene/index.tsx": minimal(""), "../evil.ts": "" });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/files live in scene\//);
  });
});
