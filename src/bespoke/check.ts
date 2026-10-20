import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { factNumbers, unknownNumbers } from "./facts";
import { SCENE_ENTRY } from "./film";

/**
 * The gate a scene passes before any browser runs it: path and size limits,
 * the scene rules (imports, determinism, no network or storage), its exports,
 * a real typecheck against the kit, then a transpile to CommonJS modules for
 * the page. The rules are a lint that keeps scenes deterministic.
 */

const ROOT = process.cwd();
const KIT = path.join(ROOT, "src", "bespoke", "kit", "index.ts");
const MAX_FILES = 30;
const MAX_FILE_BYTES = 80_000;
const PATH_OK = /^scene\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.tsx?$/;
const IMPORTS = new Set(["react", "remotion", "@kit"]);
/** Globals a scene has no use for: time, randomness, network, storage, timers, the page itself. */
/**
 * Globals a scene may not use: they make a frame depend on when it is
 * drawn (time, randomness, timers), or reach into the person's stored
 * keys. The network is open: a scene may load what it needs, though an
 * image from a site without CORS will not survive the MP4 export.
 */
const FORBIDDEN = new Set(["Date", "eval", "Function", "setTimeout", "setInterval", "requestAnimationFrame", "localStorage", "sessionStorage", "indexedDB", "cookieStore", "require", "process"]);

export type CheckResult = { ok: boolean; errors: string[]; modules: Record<string, string> };

const virtual = (file: string) => path.join(ROOT, "__scene__", file);

/**
 * `facts`, when given, is everything the film may state (the brief, the
 * website's words, real model names and prices): a number on screen that is
 * not in it is an error.
 */
export function checkScene(files: Record<string, string>, facts?: string): CheckResult {
  const errors: string[] = [];
  const names = Object.keys(files);
  if (!names.length) return { ok: false, errors: [`${SCENE_ENTRY} does not exist yet`], modules: {} };
  if (names.length > MAX_FILES) errors.push(`${names.length} files: keep the scene to ${MAX_FILES} or fewer`);
  for (const n of names) {
    if (!PATH_OK.test(n) || n.includes("..")) errors.push(`${n}: files live in scene/ and end in .tsx or .ts`);
    else if (Buffer.byteLength(files[n]) > MAX_FILE_BYTES) errors.push(`${n}: over ${MAX_FILE_BYTES / 1000} kB; split it into smaller components`);
  }
  if (files[SCENE_ENTRY] === undefined) errors.push(`${SCENE_ENTRY} does not exist yet`);
  if (errors.length) return { ok: false, errors, modules: {} };

  const known = facts === undefined ? null : factNumbers(facts);
  for (const n of names) errors.push(...rules(n, files[n], files, known));
  const entry = files[SCENE_ENTRY];
  if (!/export\s+default\s/.test(entry)) errors.push(`${SCENE_ENTRY}: missing \`export default function Scene()\``);
  if (!/export\s+const\s+fonts\s*=/.test(entry)) errors.push(`${SCENE_ENTRY}: missing \`export const fonts = { ... }\``);
  if (!/export\s+const\s+background\s*=/.test(entry)) errors.push(`${SCENE_ENTRY}: missing \`export const background = "#..."\``);
  errors.push(...typecheck(files));
  const unique = [...new Set(errors)].slice(0, 40);
  if (unique.length) return { ok: false, errors: unique, modules: {} };

  const modules: Record<string, string> = {};
  for (const n of names) {
    modules[n] = ts.transpileModule(files[n], {
      fileName: n,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, isolatedModules: true },
    }).outputText;
  }
  return { ok: true, errors: [], modules };
}

/** Text that is style or geometry, not words a viewer reads. */
const CSSY = /(px|em\b|rem|deg|vh|vw|rgba?\(|hsla?\(|#[0-9a-f]{3,8}\b|translate|rotate|scale\(|blur\(|cubic|gradient|^\s*[MmLlCcQqAaZz][\s\d.,-]|url\(|var\(--|ms\b|^\d+(\.\d+)?%$|^-?\d+(\.\d+)?$|^b\d+([.@+-]|$))/i;
const STYLE_PROPS = /^(fontFamily|font|transform|transformOrigin|filter|background|backgroundImage|color|fill|stroke|d|points|viewBox|fontWeight|clipPath|boxShadow|id|key|gridTemplateColumns|gridTemplateRows|transition|animation|border\w*|padding|margin|inset|width|height|left|top|right|bottom|letterSpacing|lineHeight|textShadow|name|kind|mode|format)$/;
const VISIBLE_ATTRS = /^(text|label|title|caption|value|body|alt|placeholder|children|heading|subtitle|kicker|badge|cta|url)$/;

function rules(name: string, src: string, files: Record<string, string>, known: Set<string> | null): string[] {
  const out: string[] = [];
  const sf = ts.createSourceFile(name, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const at = (n: ts.Node) => `${name}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) {
      const spec = n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) ? n.moduleSpecifier.text : null;
      if (spec !== null && !IMPORTS.has(spec)) {
        if (!spec.startsWith(".")) out.push(`${at(n)}: import from "${spec}" is not allowed (react, remotion, @kit, or ./files in scene/)`);
        else if (!resolves(name, spec, files)) out.push(`${at(n)}: "${spec}" is not a file in scene/`);
      }
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) out.push(`${at(n)}: dynamic import() is not allowed`);
    if (ts.isPropertyAccessExpression(n) && n.getText() === "Math.random") out.push(`${at(n)}: Math.random is not deterministic; use seeded(n) from @kit`);
    if (ts.isIdentifier(n) && FORBIDDEN.has(n.text)) {
      const p = n.parent;
      const isName = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || (ts.isMethodDeclaration(p) && p.name === n) || ts.isJsxAttribute(p) || (ts.isPropertySignature(p) && p.name === n);
      if (!isName) out.push(`${at(n)}: "${n.text}" is not available in a scene (everything is a pure function of the frame)`);
    }
    if (known && n.parent) {
      let text: string | null = null;
      if (ts.isJsxText(n)) text = n.getText();
      else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) text = n.text;
      // A piece of a template string is judged with the whole template: "108%," is CSS when the template is a gradient.
      const whole = ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) ? templateOf(n) : n;
      const p = whole.parent;
      const literal = ts.isStringLiteral(whole) || ts.isNoSubstitutionTemplateLiteral(whole) || ts.isTemplateExpression(whole);
      const styleLike =
        (literal && ((ts.isPropertyAssignment(p) && STYLE_PROPS.test(p.name.getText())) || (ts.isJsxAttribute(p) && !VISIBLE_ATTRS.test(p.name.getText())) || ts.isImportDeclaration(p) || ts.isExportDeclaration(p))) ||
        (ts.isCallExpression(p) && /(^|\.)cue$/.test(p.expression.getText())) ||
        (whole !== n && CSSY.test(whole.getText()));
      if (text && text.trim() && !CSSY.test(text.trim()) && !styleLike) {
        for (const num of unknownNumbers(text, known)) out.push(`${at(n)}: on-screen text "${text.trim().slice(0, 40)}" shows ${num}, which is not in the facts`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The template string a head, middle or tail piece belongs to. */
function templateOf(n: ts.Node): ts.Node {
  let t: ts.Node = n;
  while (t.parent && !ts.isTemplateExpression(t)) t = t.parent;
  return ts.isTemplateExpression(t) ? t : n;
}

function resolves(from: string, spec: string, files: Record<string, string>): boolean {
  const parts = from.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  const base = parts.join("/");
  return ["", ".tsx", ".ts", "/index.tsx", "/index.ts"].some((ext) => files[base + ext] !== undefined);
}

const OPTIONS: ts.CompilerOptions = {
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  strict: true,
  noImplicitAny: false,
  noEmit: true,
  skipLibCheck: true,
  esModuleInterop: true,
  allowImportingTsExtensions: true,
  baseUrl: ROOT,
  paths: { "@kit": [KIT] },
  types: [],
  lib: ["lib.dom.d.ts", "lib.es2022.d.ts"],
};

/** The TypeScript compiler over the scene's files (held in memory) and the real kit and libraries. */
function typecheck(files: Record<string, string>): string[] {
  const byPath = new Map(Object.entries(files).map(([n, src]) => [path.normalize(virtual(n)), src]));
  const base = ts.createCompilerHost(OPTIONS, true);
  const host: ts.CompilerHost = {
    ...base,
    fileExists: (f) => byPath.has(path.normalize(f)) || base.fileExists(f),
    readFile: (f) => byPath.get(path.normalize(f)) ?? base.readFile(f),
    getSourceFile: (f, lang, onError) => {
      const src = byPath.get(path.normalize(f));
      if (src !== undefined) return ts.createSourceFile(f, src, lang, true, f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      return base.getSourceFile(f, lang, onError);
    },
    directoryExists: (d) => [...byPath.keys()].some((k) => k.startsWith(path.normalize(d) + path.sep)) || (base.directoryExists?.(d) ?? existsSync(d)),
  };
  const program = ts.createProgram([...byPath.keys()], OPTIONS, host);
  const out: string[] = [];
  for (const d of ts.getPreEmitDiagnostics(program)) {
    if (!d.file) {
      out.push(ts.flattenDiagnosticMessageText(d.messageText, " "));
      continue;
    }
    const f = path.normalize(d.file.fileName);
    if (!byPath.has(f)) continue;
    const { line } = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
    out.push(`${path.relative(path.join(ROOT, "__scene__"), f).split(path.sep).join("/")}:${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
  }
  return out;
}

/** The kit's source, for the model's system prompt. */
export const kitSource = () =>
  ["index.ts", "film.tsx", "beat.tsx", "motion.ts", "text.tsx", "draw.tsx", "annotate.tsx", "fx.tsx", "ui.tsx", "space.tsx", "sound.tsx", "sfx.ts", "blocks.tsx", "cinetic.tsx"].map((f) => `--- @kit/${f} ---\n${readFileSync(path.join(ROOT, "src", "bespoke", "kit", f), "utf8")}`).join("\n\n");
