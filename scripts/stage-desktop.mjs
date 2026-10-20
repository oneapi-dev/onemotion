// Stages the desktop app's server: the Next.js standalone build (made with
// ONEMOTION_DESKTOP_BUILD=1), its static files and public/, copied into
// desktop/server with every link resolved (Windows junctions in the
// standalone output store absolute paths and do not survive packaging).
// Then checks that the files the server reads at runtime are there and that
// no source maps or secrets went along.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync, statSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STANDALONE = path.join(ROOT, ".next", "standalone");
const OUT = path.join(ROOT, "desktop", "server");

if (process.argv.includes("--build")) {
  // The same app as the web edition, built as a self-contained server.
  const r = spawnSync(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "build"], { stdio: "inherit", env: { ...process.env, ONEMOTION_DESKTOP_BUILD: "1", NEXT_TELEMETRY_DISABLED: "1" } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!existsSync(path.join(STANDALONE, "server.js"))) {
  console.error("No standalone build: run `npm run desktop:next` first.");
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
cpSync(STANDALONE, OUT, { recursive: true, dereference: true });
cpSync(path.join(ROOT, ".next", "static"), path.join(OUT, ".next", "static"), { recursive: true, dereference: true });
cpSync(path.join(ROOT, "public"), path.join(OUT, "public"), { recursive: true, dereference: true });
// A local env file never ships: the app's defaults point at OneAPI.
for (const f of [".env", ".env.local", ".env.production.local"]) rmSync(path.join(OUT, f), { force: true });

const problems = [];
for (const need of ["server.js", "src/bespoke/kit/index.ts", "src/bespoke/examples/pattern/film.json", "node_modules/typescript/lib/lib.dom.d.ts", "node_modules/remotion/package.json", "public/music"]) {
  if (!existsSync(path.join(OUT, need))) problems.push(`missing ${need}`);
}

let bytes = 0;
let maps = 0;
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else {
      bytes += statSync(p).size;
      if (p.endsWith(".map") && p.includes(`${path.sep}static${path.sep}`)) maps++;
      if (/\.(js|json|mjs|cjs)$/.test(e.name) && statSync(p).size < 5_000_000) {
        const src = readFileSync(p, "utf8");
        if (/sk-[A-Za-z0-9]{32,}|xi-api-key["']?\s*[:=]\s*["'][A-Za-z0-9]{20,}/.test(src)) problems.push(`possible secret in ${path.relative(OUT, p)}`);
      }
    }
  }
};
walk(OUT);
if (maps) problems.push(`${maps} browser source maps in the static files`);

console.log(`Staged ${(bytes / 1e6).toFixed(1)} MB into ${path.relative(ROOT, OUT)}`);
if (problems.length) {
  console.error(problems.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}
