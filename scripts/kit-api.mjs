// Writes the kit's public API (declarations: no bodies, no comments) to src/bespoke/kit/api.txt. The
// motion designer's prompt carries it instead of the kit's whole source: exact names and props at a
// fifth of the size. Run it after changing the kit (`npm run kit:api`); a test fails while it is stale.
// `--stdout` prints it instead of writing the file.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const FILES = ["film.tsx", "beat.tsx", "world.tsx", "motion.ts", "text.tsx", "draw.tsx", "annotate.tsx", "wire.tsx", "fx.tsx", "ui.tsx", "space.tsx", "sound.tsx", "sfx.ts", "blocks.tsx", "cinetic.tsx"];

export function kitApi(root = process.cwd()) {
  const kit = path.join(root, "src", "bespoke", "kit");
  const options = {
    declaration: true,
    emitDeclarationOnly: true,
    removeComments: true,
    stripInternal: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
  };
  const out = new Map();
  const host = ts.createCompilerHost(options);
  host.writeFile = (file, text) => out.set(path.basename(file).replace(/\.d\.ts$/, ""), text);
  ts.createProgram(
    FILES.map((f) => path.join(kit, f)),
    options,
    host,
  ).emit(undefined, undefined, undefined, true);
  return FILES.map((f) => f.replace(/\.tsx?$/, ""))
    .map((name) => {
      const text = (out.get(name) ?? "")
        .split("\n")
        .filter((l) => !/^import\s/.test(l) && l.trim() !== "export {};")
        .join("\n")
        .replace(/import\("react\/jsx-runtime"\)\.JSX\.Element/g, "JSX.Element")
        .replace(/import\("react"\)\./g, "")
        .replace(/\(\{[^()]*?\}: \{/g, "(props: {")
        .replace(/\n {4,}/g, " ")
        .replace(/\n\}/g, " }")
        .trim();
      return `--- @kit/${name} ---\n${text}`;
    })
    .join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const api = `${kitApi()}\n`;
  if (process.argv.includes("--stdout")) process.stdout.write(api);
  else {
    writeFileSync(path.join(process.cwd(), "src", "bespoke", "kit", "api.txt"), api);
    console.log(`src/bespoke/kit/api.txt: ${api.length} characters`);
  }
}
