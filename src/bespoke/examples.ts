import "server-only";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src", "bespoke", "examples");

export type Example = { name: string; film: Record<string, unknown>; files: Record<string, string> };

/** A hand-written example film: its film.json and its scene files, keyed as a model writes them (scene/...). */
export function readExample(name: string): Example | null {
  if (!/^[a-z0-9-]+$/.test(name)) return null;
  const dir = path.join(ROOT, name);
  if (!existsSync(path.join(dir, "film.json"))) return null;
  const files: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) files[path.relative(dir, full).split(path.sep).join("/")] = readFileSync(full, "utf8");
    }
  };
  walk(path.join(dir, "scene"));
  return { name, film: JSON.parse(readFileSync(path.join(dir, "film.json"), "utf8")), files };
}
