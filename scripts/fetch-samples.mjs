// Fetches and prepares the instrument samples the music composer plays.
//
//   node scripts/fetch-samples.mjs
//
// scripts/samples.json lists each sample's source file in VCSL (CC0) with its
// git blob SHA. Every download is checked against that SHA, then trimmed to
// its attack, cut to length with a faded tail, peak-normalized to -1 dBFS and
// encoded as Opus (Ogg; its pre-skip header keeps hits on time, unlike MP3's
// encoder delay). Writes:
//
//   public/samples/<instrument>/<name>.ogg
//   public/samples/CREDITS.md
//   src/music/samples.ts          the manifest the composer loads (generated)
//
// Downloads are cached in node_modules/.cache/vcsl, so a rerun only encodes.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "samples");
const CACHE = join(ROOT, "node_modules", ".cache", "vcsl");
const MANIFEST = join(ROOT, "src", "music", "samples.ts");
const doc = JSON.parse(readFileSync(join(ROOT, "scripts", "samples.json"), "utf8"));

/** The ffmpeg Remotion ships with its compositor (has libopus). */
function findFfmpeg() {
  const dir = join(ROOT, "node_modules", "@remotion");
  for (const name of readdirSync(dir)) {
    if (!name.startsWith("compositor-")) continue;
    for (const bin of ["ffmpeg.exe", "ffmpeg"]) if (existsSync(join(dir, name, bin))) return join(dir, name, bin);
  }
  throw new Error("No ffmpeg found under node_modules/@remotion/compositor-*. Run npm install.");
}

/** Git's blob hash: what the source tree lists for each file. */
const blobSha = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

async function download(sample) {
  const cached = join(CACHE, `${sample.sha}.wav`);
  if (existsSync(cached)) return readFileSync(cached);
  const url = `https://raw.githubusercontent.com/sgossner/VCSL/${doc.source.ref}/${sample.source.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const got = blobSha(bytes);
  if (got !== sample.sha) throw new Error(`${sample.source}: SHA ${got} does not match the manifest's ${sample.sha}`);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cached, bytes);
  return bytes;
}

/** Reads PCM (16, 24 or 32 bit) or 32-bit float WAV into one Float32Array per channel. */
function readWav(buf, label) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error(`${label}: not a WAV file`);
  let fmt = null;
  let data = null;
  for (let o = 12; o + 8 <= buf.length; ) {
    const id = buf.toString("ascii", o, o + 4);
    const size = buf.readUInt32LE(o + 4);
    if (id === "fmt ") {
      const tag = buf.readUInt16LE(o + 8);
      // WAVE_FORMAT_EXTENSIBLE keeps the real format code in its subformat GUID.
      const format = tag === 0xfffe && size >= 40 ? buf.readUInt16LE(o + 8 + 24) : tag;
      fmt = { format, channels: buf.readUInt16LE(o + 10), rate: buf.readUInt32LE(o + 12), bits: buf.readUInt16LE(o + 22) };
    }
    if (id === "data") data = buf.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`${label}: missing fmt or data chunk`);
  if (fmt.format !== 1 && fmt.format !== 3) throw new Error(`${label}: WAV format ${fmt.format} is not PCM or float`);
  const float = fmt.format === 3;
  const step = fmt.bits / 8;
  const frames = Math.floor(data.length / (step * fmt.channels));
  const out = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < fmt.channels; c++) {
      const o = (i * fmt.channels + c) * step;
      let v;
      if (float) v = data.readFloatLE(o);
      else if (fmt.bits === 16) v = data.readInt16LE(o) / 32768;
      else if (fmt.bits === 24) v = data.readIntLE(o, 3) / 8388608;
      else if (fmt.bits === 32) v = data.readInt32LE(o) / 2147483648;
      else throw new Error(`${label}: ${fmt.bits}-bit audio is not supported`);
      out[c][i] = v;
    }
  }
  return { rate: fmt.rate, channels: out };
}

function writeWav(path, rate, channels) {
  const frames = channels[0].length;
  const bytes = frames * channels.length * 2;
  const buf = Buffer.alloc(44 + bytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + bytes, 4);
  buf.write("WAVEfmt ", 8, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels.length, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * channels.length * 2, 28);
  buf.writeUInt16LE(channels.length * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(bytes, 40);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (const ch of channels) {
      buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(ch[i] * 32767))), o);
      o += 2;
    }
  }
  writeFileSync(path, buf);
}

/**
 * Trims to the attack (2 ms before the first sample above -40 dB of the
 * peak), unless the sample builds up from silence (swells, rolls); cuts to
 * `seconds` with a cosine fade over the last fifth; normalizes the peak to
 * -1 dBFS. Returns where the loudest moment lands, for swells to time their
 * peak onto a hit.
 */
function prepare({ rate, channels }, sample) {
  const n = channels[0].length;
  const level = (i) => Math.max(...channels.map((c) => Math.abs(c[i])));
  let peak = 0;
  let peakAt = 0;
  for (let i = 0; i < n; i++) {
    const v = level(i);
    if (v > peak) [peak, peakAt] = [v, i];
  }
  if (peak === 0) throw new Error(`${sample.source}: silent`);
  const buildsUp = sample.instrument === "swell" || sample.name === "roll";
  let start = 0;
  if (!buildsUp) {
    while (start < n && level(start) < peak * 0.01) start++;
    start = Math.max(0, start - Math.round(rate * 0.002));
  }
  const length = Math.min(n - start, Math.round(sample.seconds * rate));
  const fade = Math.round(length * 0.2);
  const gain = 0.891 / peak;
  const out = channels.map((c) => {
    const o = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const tail = i - (length - fade);
      const env = tail > 0 ? 0.5 + 0.5 * Math.cos((Math.PI * tail) / fade) : 1;
      o[i] = c[start + i] * gain * env;
    }
    return o;
  });
  return { channels: out, peak: (peakAt - start) / rate };
}

const ffmpeg = findFfmpeg();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const manifest = {};
let total = 0;
for (const sample of doc.samples) {
  const wav = readWav(await download(sample), sample.source);
  const { channels, peak } = prepare(wav, sample);
  const dir = join(OUT, sample.instrument);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `${sample.name}.tmp.wav`);
  const file = join(dir, `${sample.name}.ogg`);
  writeWav(tmp, wav.rate, channels);
  const bitrate = channels.length > 1 ? "96k" : "64k";
  execFileSync(ffmpeg, ["-v", "error", "-y", "-i", tmp, "-ar", "48000", "-c:a", "libopus", "-b:a", bitrate, file]);
  rmSync(tmp);
  const size = readFileSync(file).length;
  total += size;
  (manifest[sample.instrument] ??= {})[sample.name] = {
    file: `samples/${sample.instrument}/${sample.name}.ogg`,
    ...(sample.note ? { note: sample.note } : {}),
    ...(sample.instrument === "swell" ? { peak: Math.round(peak * 1000) / 1000 } : {}),
  };
  console.log(`${sample.instrument}/${sample.name}.ogg  ${(size / 1024).toFixed(0)} KB`);
}

writeFileSync(
  MANIFEST,
  `// Generated by scripts/fetch-samples.mjs. Do not edit by hand.

/** A prepared sample: its file under public/, the note it plays, and for a swell when it peaks (s). */
export type SampleFile = { file: string; note?: string; peak?: number };

export const SAMPLES = ${JSON.stringify(manifest, null, 2)} as const satisfies Record<string, Record<string, SampleFile>>;
`,
);

const rows = doc.samples.map((s) => `| \`${s.instrument}/${s.name}.ogg\` | ${s.source} |`).join("\n");
writeFileSync(
  join(OUT, "CREDITS.md"),
  `# Instrument samples

Every sample here comes from [${doc.source.name}](${doc.source.url}), released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain): no attribution is required.
They were trimmed, faded, normalized and re-encoded by \`scripts/fetch-samples.mjs\`.

| File | Source in VCSL |
|---|---|
${rows}
`,
);
console.log(`${doc.samples.length} samples, ${(total / 1024 / 1024).toFixed(2)} MB`);
