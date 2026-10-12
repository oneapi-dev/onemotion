// Renders a video on this machine with Remotion and headless Chrome, for
// when a browser export is not an option.
//
//   npm run render -- video.json [out.mp4]
//
// video.json is what "Download plan" saves in the app:
//   { "plan": {...}, "format": "landscape", "brand": {...} }
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [source, target] = process.argv.slice(2);
if (!source) {
  console.error("usage: npm run render -- video.json [out.mp4]");
  process.exit(1);
}

const doc = JSON.parse(readFileSync(resolve(source), "utf8"));
if (!doc.plan || !Array.isArray(doc.plan.scenes)) {
  console.error(`${source} has no plan. Use the file "Download plan" saves.`);
  process.exit(1);
}
const inputProps = {
  plan: doc.plan,
  format: ["landscape", "portrait", "square"].includes(doc.format) ? doc.format : "landscape",
  brand: { name: doc.brand?.name ?? doc.plan.brand ?? "", domain: doc.brand?.domain ?? "", logo_src: doc.brand?.logo_src ?? null },
  shots: [],
};
const out = resolve(target ?? join(root, "renders", `${basename(source).replace(/\.json$/, "")}.mp4`));

console.log("bundling…");
const serveUrl = await bundle({ entryPoint: join(root, "src", "engine", "remotion", "index.ts"), publicDir: join(root, "public") });
const composition = await selectComposition({ serveUrl, id: "video", inputProps });
const started = Date.now();
let shown = -1;
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  crf: 18,
  outputLocation: out,
  inputProps,
  onProgress: ({ progress }) => {
    const pct = Math.floor(progress * 10) * 10;
    if (pct !== shown) {
      shown = pct;
      console.log(`${pct}%`);
    }
  },
});
console.log(`wrote ${out} in ${Math.round((Date.now() - started) / 1000)}s`);
