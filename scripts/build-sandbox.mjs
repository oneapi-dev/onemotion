// Bundles the sandbox runtime (src/bespoke/runtime/main.tsx) into
// public/sandbox/runtime/: React, Remotion, the Player, the web renderer, the
// scene kit and the music composer, as ES modules, fonts split out so a scene
// loads only the faces it uses.
//
// Run: node scripts/build-sandbox.mjs [--watch]
import * as esbuild from "esbuild";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "sandbox", "runtime");
const watch = process.argv.includes("--watch");

rmSync(OUT, { recursive: true, force: true });
const options = {
  entryPoints: [join(ROOT, "src", "bespoke", "runtime", "main.tsx")],
  outdir: OUT,
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  alias: { "@": join(ROOT, "src") },
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
  chunkNames: "chunks/[name]-[hash]",
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
