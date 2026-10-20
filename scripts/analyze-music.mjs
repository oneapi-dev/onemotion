// Reads the built-in tracks (public/music) for their downbeat and drops, with the
// same analysis the studio runs on a person's own track (src/music/analyze.ts),
// and writes them into scripts/music.json and src/music/library.ts.
// Run after `npm run music`; needs Node 22.6+ (TypeScript type stripping) and
// the ffmpeg that ships with @remotion/compositor (a dev dependency).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeMusic } from "../src/music/analyze.ts";

const ROOT = process.cwd();
const SR = 22050;
const compositor = readdirSync(path.join(ROOT, "node_modules", "@remotion")).find((d) => d.startsWith("compositor-"));
if (!compositor) throw new Error("ffmpeg not found: install the dev dependencies (npm install).");
const ffmpeg = path.join(ROOT, "node_modules", "@remotion", compositor, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

/** A track as mono samples at SR, via a 16-bit WAV (the bundled ffmpeg has no raw output formats). */
function samples(file) {
  const wav = path.join(tmpdir(), `onemotion-analyze-${process.pid}.wav`);
  execFileSync(ffmpeg, ["-y", "-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-c:a", "pcm_s16le", wav]);
  const buf = readFileSync(wav);
  rmSync(wav, { force: true });
  const data = buf.subarray(44);
  const out = new Float32Array(data.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = data.readInt16LE(i * 2) / 32768;
  return out;
}

const manifestPath = path.join(ROOT, "scripts", "music.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const libraryPath = path.join(ROOT, "src", "music", "library.ts");
let library = readFileSync(libraryPath, "utf8");
const start = library.indexOf("= [") + 2;
const entries = JSON.parse(library.slice(start, library.lastIndexOf("]") + 1));

for (const t of manifest.tracks) {
  const file = path.join(ROOT, "public", "music", `${t.id}.mp3`);
  if (!existsSync(file)) {
    console.warn(`skip ${t.id}: no ${path.relative(ROOT, file)}`);
    continue;
  }
  const m = analyzeMusic(samples(file), SR, t.bpm);
  t.downbeat = m.downbeat;
  t.drops = m.drops;
  const e = entries.find((x) => x.id === t.id);
  if (e) Object.assign(e, { downbeat: m.downbeat, drops: m.drops });
  console.log(`${t.id.padEnd(20)} ${String(t.bpm).padStart(6)} bpm  downbeat ${m.downbeat.toFixed(2)}s  drops ${m.drops.map((d) => d.toFixed(1)).join(", ") || "none"}`);
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
library = library.slice(0, start) + JSON.stringify(entries, null, 2) + library.slice(library.lastIndexOf("]") + 1);
writeFileSync(libraryPath, library);
console.log("Wrote scripts/music.json and src/music/library.ts");
