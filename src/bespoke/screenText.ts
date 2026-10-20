import "server-only";
import ts from "typescript";
import { hex6, type SceneColor, type ScreenText } from "./textEdit";

/**
 * The words a scene puts on screen, found in its source: JSX text, string
 * props a viewer reads (text, label, title, ...), strings shown as JSX
 * children, and the word lists and constants those draw from. Style values
 * (fonts, colours, sizes, paths, cues) are left out. Each comes with its
 * exact source range, so an edit replaces that piece and nothing else.
 */

/** Text that is style or geometry, not words a viewer reads. */
const CSSY = /(\d(px|em|rem|deg|vh|vw|ms|s)\b|rgba?\(|hsla?\(|^#[0-9a-f]{3,8}$|translate|rotate|scale\(|blur\(|cubic-bezier|gradient\(|^\s*[MmLlCcQqAaZz][\s\d.,-]+$|url\(|var\(--|^-?\d+(\.\d+)?%?$|^b\d+([.:@+-]|$))/i;
/** Props and keys whose string is read on screen. */
const VISIBLE = /^(text|label|title|caption|value|body|alt|children|heading|headline|subtitle|subhead|kicker|eyebrow|badge|cta|url|line|lines|word|words|say|says|copy|quote|tag|note|step|steps|items?|prefix|suffix|unit|lead|message|description|desc|name|price|amount)$/i;
/** Props and keys whose string is style, layout or code. */
const STYLE = /^(fontFamily|font|fonts|family|display|transform|transformOrigin|filter|background|backgroundImage|backgroundColor|color|colour|fill|stroke|d|points|viewBox|fontWeight|clipPath|boxShadow|id|key|className|gridTemplateColumns|gridTemplateRows|gridArea|transition|animation|border\w*|padding\w*|margin\w*|inset|width|height|left|top|right|bottom|letterSpacing|lineHeight|textShadow|textAlign|textTransform|whiteSpace|justifyContent|alignItems|alignSelf|flexDirection|flexWrap|position|overflow|zIndex|opacity|mixBlendMode|objectFit|cursor|kind|mode|format|easing|ease|extrapolateLeft|extrapolateRight|src|href|logo|image|icon|type|variant|shape|align|side|direction|at|cue|beat|accent|ink|bg|tone)$/i;

/** Elements whose props are never words on screen: sounds, media, marks. */
const NON_TEXT_ELEMENTS = /^(Sfx|Audio|Sound|Video|OffthreadVideo|Img|Asset|Mark|Logo|Icon|Sequence|Series|AbsoluteFill)$/;

const hasWords = (s: string) => /\p{L}/u.test(s) && !CSSY.test(s.trim());

const decodeJsx = (s: string) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/** Climb through wrappers that pass a value on unchanged: parentheses, conditionals, `??`, `||`, `as`. */
function context(n: ts.Node): ts.Node {
  let p = n.parent;
  let c: ts.Node = n;
  while (p && (ts.isParenthesizedExpression(p) || (ts.isConditionalExpression(p) && p.condition !== c) || (ts.isBinaryExpression(p) && (p.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || p.operatorToken.kind === ts.SyntaxKind.BarBarToken || p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) && p.right === c) || ts.isAsExpression(p) || ts.isSatisfiesExpression(p))) {
    c = p;
    p = p.parent;
  }
  return p;
}

const nameOf = (n: ts.PropertyName | ts.JsxAttributeName) => (ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : ts.isJsxNamespacedName?.(n) ? n.name.text : n.getText());

/** Identifiers used as a style value somewhere (`fontFamily: DISPLAY`): their constants are style, not words. */
function styleNames(sf: ts.SourceFile, out: Set<string>) {
  const visit = (n: ts.Node) => {
    if (ts.isPropertyAssignment(n) && STYLE.test(nameOf(n.name)) && ts.isIdentifier(n.initializer)) out.add(n.initializer.text);
    if (ts.isJsxAttribute(n) && STYLE.test(nameOf(n.name)) && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression && ts.isIdentifier(n.initializer.expression)) out.add(n.initializer.expression.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

/** Whether a string at this place is read by a viewer. */
function visible(lit: ts.Node, style: Set<string>): boolean {
  const p = context(lit);
  if (!p) return false;
  if (ts.isJsxAttribute(p)) {
    const tag = p.parent.parent.tagName.getText().split(".").pop() ?? "";
    return !NON_TEXT_ELEMENTS.test(tag) && VISIBLE.test(nameOf(p.name)) && !STYLE.test(nameOf(p.name));
  }
  if (ts.isJsxExpression(p)) return Boolean(p.parent && (ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent)));
  if (ts.isPropertyAssignment(p)) return VISIBLE.test(nameOf(p.name)) && !STYLE.test(nameOf(p.name));
  if (ts.isArrayLiteralExpression(p)) {
    const holder = context(p);
    if (holder && ts.isPropertyAssignment(holder)) return !STYLE.test(nameOf(holder.name));
    if (holder && ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name)) return !style.has(holder.name.text) && !/font|color|colour|palette|ease/i.test(holder.name.text);
    if (holder && ts.isJsxExpression(holder)) return false;
    return Boolean(holder && (ts.isVariableDeclaration(holder) || ts.isReturnStatement(holder) || ts.isArrayLiteralExpression(holder)));
  }
  if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) {
    const id = p.name.text;
    return !style.has(id) && !/font|family|color|colour|ease|path|url|src|href|cue/i.test(id);
  }
  return false;
}

/** Every piece of on-screen text in the scene's files, in file order. */
export function screenTexts(files: Record<string, string>): ScreenText[] {
  const out: ScreenText[] = [];
  const sources = Object.entries(files).map(([file, src]) => ({ file, src, sf: ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS) }));
  const style = new Set<string>();
  for (const s of sources) styleNames(s.sf, style);
  for (const { file, src, sf } of sources) {
    const push = (start: number, end: number, text: string, kind: ScreenText["kind"], dynamic: boolean) => out.push({ id: `${file}:${start}`, file, start, end, text, kind, line: sf.getLineAndCharacterOfPosition(start).line + 1, dynamic });
    const visit = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isTypeNode(n)) return;
      // The fonts and the background the entry exports are style.
      if (ts.isVariableStatement(n) && n.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && /^(fonts|background)$/.test(d.name.text))) return;
      // A cue("b2:word") or an element key is code.
      if (ts.isCallExpression(n) && /(^|\.)(cue|seeded|staticFile)$/.test(n.expression.getText())) return;
      if (ts.isElementAccessExpression(n) || ts.isCaseClause(n)) {
        ts.forEachChild(n, visit);
        return;
      }
      if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(n.operatorToken.kind)) return;
      if (ts.isJsxText(n)) {
        const raw = src.slice(n.getStart(), n.getEnd());
        const lead = raw.length - raw.trimStart().length;
        const trail = raw.length - raw.trimEnd().length;
        const words = decodeJsx(raw.trim().replace(/\s+/g, " "));
        if (words && hasWords(words)) push(n.getStart() + lead, n.getEnd() - trail, words, "jsx", false);
      } else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && hasWords(n.text) && visible(n, style)) {
        push(n.getStart(), n.getEnd(), n.text, n.parent && ts.isJsxAttribute(n.parent) ? "attr" : "string", false);
      } else if (ts.isTemplateExpression(n) && visible(n, style)) {
        const shown = [n.head.text, ...n.templateSpans.map((s) => `…${s.literal.text}`)].join("");
        // Shown when its own words carry it ("Rendering … %"), not when it is a label built from numbers ("f06").
        if (hasWords(shown) && (shown.match(/\p{L}/gu)?.length ?? 0) >= 3) push(n.getStart(), n.getEnd(), shown, "string", true);
        return;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

const COLOR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z])|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}/gi;

/** A colour as written (#hex or the start of rgb()/rgba()) as #RRGGBB. */
function colorOf(m: string): string | null {
  if (m.startsWith("#")) return hex6(m);
  const [r, g, b] = (m.match(/\d{1,3}/g) ?? []).map(Number);
  return [r, g, b].every((v) => v >= 0 && v <= 255) ? `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}` : null;
}

/**
 * The colours a scene's strings name, most used first, and the background
 * the entry exports: what the person can swap by hand.
 */
export function sceneColors(files: Record<string, string>): { colors: SceneColor[]; background: string | null } {
  const uses = new Map<string, number>();
  const named = new Map<string, string>();
  let background: string | null = null;
  let backgroundName: string | null = null;
  for (const [file, src] of Object.entries(files)) {
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n: ts.Node): void => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
        for (const m of n.text.match(COLOR) ?? []) {
          const c = colorOf(m);
          if (c) uses.set(c, (uses.get(c) ?? 0) + 1);
        }
        if (ts.isStringLiteral(n) && ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name)) {
          const c = hex6(n.text);
          if (c) named.set(n.parent.name.text, c);
          if (n.parent.name.text === "background") background = c;
        }
      }
      // `export const background = GRAPHITE`: the colour is the constant's.
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "background" && n.initializer && ts.isIdentifier(n.initializer)) backgroundName = n.initializer.text;
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  const colors = [...uses].map(([value, n]) => ({ value, uses: n })).sort((a, b) => b.uses - a.uses).slice(0, 12);
  return { colors, background: background ?? (backgroundName ? (named.get(backgroundName) ?? null) : null) };
}
