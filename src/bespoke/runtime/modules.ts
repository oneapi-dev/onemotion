import type { ComponentType } from "react";
import { SCENE_ENTRY } from "../film";
import type { FontRequest } from "../kit/fonts";

export type SceneModule = {
  default: ComponentType;
  fonts?: FontRequest;
  background?: string;
};

const EXTENSIONS = ["", ".tsx", ".ts", "/index.tsx", "/index.ts"];

/** A relative import resolved against the importing file, within the scene's files. */
function resolve(from: string, spec: string, files: Record<string, string>): string {
  const parts = from.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  const base = parts.join("/");
  for (const ext of EXTENSIONS) if (files[base + ext] !== undefined) return base + ext;
  throw new Error(`${from}: cannot find "${spec}"`);
}

/**
 * Runs the scene's compiled modules (CommonJS, from the check step) and
 * returns its entry's exports. They can require only the given externals
 * (react, remotion, @kit) and each other.
 */
export function loadScene(files: Record<string, string>, externals: Record<string, unknown>): SceneModule {
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const load = (id: string): Record<string, unknown> => {
    const hit = cache.get(id);
    if (hit) return hit.exports;
    const mod = { exports: {} as Record<string, unknown> };
    cache.set(id, mod);
    const require = (spec: string) => {
      if (Object.hasOwn(externals, spec)) return externals[spec];
      if (spec.startsWith(".")) return load(resolve(id, spec, files));
      throw new Error(`${id}: import from "${spec}" is not allowed`);
    };
    const run = new Function("require", "module", "exports", files[id]);
    run(require, mod, mod.exports);
    return mod.exports;
  };
  if (files[SCENE_ENTRY] === undefined) throw new Error(`${SCENE_ENTRY} is missing`);
  const entry = load(SCENE_ENTRY);
  if (typeof entry.default !== "function") throw new Error(`${SCENE_ENTRY} must export default function Scene()`);
  return entry as SceneModule;
}
