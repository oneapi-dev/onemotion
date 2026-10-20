/**
 * Editing the words on screen by hand, without the AI: each piece of text a
 * scene shows is found in its source (screenText.ts, on the server), and an
 * edit replaces exactly that piece and nothing else. Pure: runs in the page.
 */

export type ScreenText = {
  /** `file:offset`: stable for one version of the files. */
  id: string;
  file: string;
  /** The source range the edit replaces: the literal with its quotes, or the trimmed JSX text. */
  start: number;
  end: number;
  /** The words as the viewer reads them. */
  text: string;
  /** JSX text, a string in code, or a string prop (`text="..."`, where backslash escapes do not exist). */
  kind: "jsx" | "string" | "attr";
  line: number;
  /** Assembled from code (a template with values in it): only the AI can change it. */
  dynamic: boolean;
};

/** A change the person made by hand: kept word for word by later AI edits. */
export type TextEdit = { was: string; now: string };

/** The source for new words: a string literal, or JSX text (in braces when it holds characters JSX reads as code). */
export function encodeText(kind: ScreenText["kind"], text: string): string {
  if (kind === "string") return JSON.stringify(text);
  if (kind === "attr") return /["\n]/.test(text) ? `{${JSON.stringify(text)}}` : `"${text}"`;
  return /[{}<>&"'\n]/.test(text) ? `{${JSON.stringify(text)}}` : text;
}

/** The scene with one piece of text replaced. Throws when the source no longer holds it (the files changed since it was read). */
export function replaceScreenText(files: Record<string, string>, t: ScreenText, next: string): Record<string, string> {
  const src = files[t.file];
  if (src === undefined) throw new Error(`${t.file} is no longer in the scene.`);
  if (t.dynamic) throw new Error("This text is put together by the scene's code: change it with Improve with AI.");
  const before = src.slice(t.start, t.end);
  const expected = t.kind === "jsx" ? before.trim().length > 0 : before.length >= 2 && /^["'`]/.test(before);
  if (!expected) throw new Error("The scene changed since this text was read. Open the Text tab again.");
  return { ...files, [t.file]: src.slice(0, t.start) + encodeText(t.kind, next) + src.slice(t.end) };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The pieces of text a viewer sees in `shown` (what the preview shows now):
 * whole, or begun (a line still typing itself out).
 */
export function onScreen(items: ScreenText[], shown: string): ScreenText[] {
  const s = norm(shown);
  if (!s) return [];
  const at = (t: ScreenText) => {
    const x = norm(t.text);
    if (!x) return -1;
    if (s.includes(x)) return s.indexOf(x);
    // A long line typing itself out: its first words are already there. A short one must be whole ("Jadi konsep." is not "Jadi MP4.").
    return x.length >= 12 ? s.indexOf(x.slice(0, Math.max(10, Math.ceil(x.length * 0.4)))) : -1;
  };
  // In reading order: the order the preview shows them in.
  return items
    .map((t) => ({ t, i: at(t) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.t);
}

/** The piece of text a click landed on: the one that best covers the clicked words. */
export function pickText(items: ScreenText[], clicked: string): ScreenText | null {
  const c = norm(clicked);
  if (!c) return null;
  let best: ScreenText | null = null;
  let score = 0;
  for (const t of items) {
    const x = norm(t.text);
    if (!x) continue;
    const s = c === x ? 3 : c.includes(x) ? 1 + x.length / c.length : x.includes(c) ? 1 + c.length / x.length : 0;
    if (s > score) {
      score = s;
      best = t;
    }
  }
  return best;
}

/** Hand edits whose words the scene's files no longer hold (as typed, or as a string literal writes them). */
export function missingEdits(files: Record<string, string>, edits: TextEdit[]): TextEdit[] {
  const all = Object.values(files).join("\n");
  return edits.filter((e) => !all.includes(e.now) && !all.includes(JSON.stringify(e.now).slice(1, -1)));
}

/** Whether new words are long enough to risk overflowing the layout the old ones were set in. */
export const mayOverflow = (was: string, now: string) => now.length > was.length * 1.3 + 4;

/** The person's hand edits after one more: an edit of an edited text replaces it, and an edit back to the original drops it. */
export function addEdit(edits: TextEdit[], was: string, now: string): TextEdit[] {
  const prior = edits.find((e) => e.now === was);
  const origin = prior ? prior.was : was;
  const rest = edits.filter((e) => e !== prior);
  return origin === now ? rest : [...rest, { was: origin, now }];
}

/** A place on the video a note is about: the frame, where on it (0 to 1 from the top left), the beat, and the words there. */
export type Pin = { frame: number; x: number; y: number; beat: string | null; words: string };

/** Where on the frame a point is, in words a designer reads ("top left", "middle"). */
export function placeOf(x: number, y: number): string {
  const v = y < 0.34 ? "top" : y > 0.66 ? "bottom" : "middle";
  const h = x < 0.34 ? "left" : x > 0.66 ? "right" : "";
  return v === "middle" && !h ? "the middle" : v === "middle" ? `the middle ${h}` : `the ${v}${h ? ` ${h}` : ""}`;
}

/** A note with the place it points at, for the AI editor: the time, the beat, where on the frame and the words there. */
export function pinnedNote(note: string, pin: Pin | null, fps: number): string {
  if (!pin) return note;
  const s = pin.frame / fps;
  const time = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.round((s % 1) * 10)).padStart(1, "0")}`;
  const words = pin.words.trim().slice(0, 80);
  return `At ${time} (frame ${pin.frame}${pin.beat ? `, in ${pin.beat}` : ""}), at ${placeOf(pin.x, pin.y)} of the frame (${Math.round(pin.x * 100)}% across, ${Math.round(pin.y * 100)}% down)${words ? `, on "${words}"` : ""}: ${note}`;
}

/** A colour the scene uses, as #RRGGBB, and how many times its source names it. */
export type SceneColor = { value: string; uses: number };

/** A colour the person swapped by hand: kept by later AI edits. */
export type ColorEdit = { was: string; now: string };

/** A hex colour as #RRGGBB (upper case), or null when it is not one. */
export function hex6(c: string): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join("") : m[1].slice(0, 6);
  return `#${h.toUpperCase()}`;
}

const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * The scene with one colour swapped for another everywhere it is written:
 * as #RGB, #RRGGBB or #RRGGBBAA (the alpha kept), and as rgb()/rgba() of the
 * same colour (its alpha kept). Everything else stays byte for byte.
 */
export function recolor(files: Record<string, string>, from: string, to: string): Record<string, string> {
  const a = hex6(from);
  const b = hex6(to);
  if (!a || !b) throw new Error("Colours are written as #RRGGBB.");
  const [r, g, bl] = rgbOf(a);
  const [nr, ng, nb] = rgbOf(b);
  const out: Record<string, string> = {};
  for (const [file, src] of Object.entries(files)) {
    out[file] = src
      .replace(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z])/gi, (m, h: string) => (hex6(m) === a ? `${b}${h.length === 8 ? h.slice(6) : ""}` : m))
      .replace(/rgb(a?)\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(,\s*[\d.]+%?\s*)?\)/gi, (m, alpha: string, x: string, y: string, z: string, rest: string | undefined) =>
        Number(x) === r && Number(y) === g && Number(z) === bl ? `rgb${alpha}(${nr}, ${ng}, ${nb}${rest ? `, ${rest.replace(/^,\s*/, "").trim()}` : ""})` : m,
      );
  }
  return out;
}

/**
 * A colour the scene does not use yet, as close to `to` as the eye cannot
 * tell: scenes tell their colours apart in code (React keys, comparisons),
 * so a swap must not make two of them the same string.
 */
export function distinctColor(to: string, used: string[]): string {
  const want = hex6(to);
  if (!want) return to;
  const taken = new Set(used.map(hex6));
  const [r, g, b] = rgbOf(want);
  for (let d = 0; d < 6 && taken.has(`#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`); d++) {
    const step = Math.ceil((d + 1) / 2) * (d % 2 ? 1 : -1);
    const nb = Math.min(255, Math.max(0, b + step));
    const c = `#${[r, g, nb].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    if (!taken.has(c)) return c;
  }
  return want;
}

/** WCAG contrast ratio between two #RRGGBB colours. */
export function contrast(x: string, y: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = rgbOf(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/** Neutrals and accents offered for any film: a short, curated set rather than a free colour picker. */
export const NEUTRALS = ["#0B0B0C", "#161616", "#2B2B2B", "#F5F3EE", "#FAFAF7", "#FFFFFF"];
export const ACCENTS = ["#FF5B1F", "#E5484D", "#F5B800", "#12A150", "#00A3A3", "#2F6BFF", "#8E4EC6"];

/** What a colour can be swapped for: the brand's own colours first, then the curated neutrals and accents. */
export function colorChoices(brand: string[], current: string): { label: string; colors: string[] }[] {
  const cur = hex6(current);
  const uniq = (xs: string[]) => [...new Set(xs.map(hex6).filter((c): c is string => Boolean(c) && c !== cur))];
  const own = uniq(brand);
  return [
    { label: "Brand", colors: own },
    { label: "Neutrals", colors: uniq(NEUTRALS).filter((c) => !own.includes(c)) },
    { label: "Accents", colors: uniq(ACCENTS).filter((c) => !own.includes(c)) },
  ].filter((g) => g.colors.length);
}

/** The person's colour swaps after one more: a swap of a swapped colour replaces it, and a swap back drops it. */
export function addColorEdit(edits: ColorEdit[], was: string, now: string): ColorEdit[] {
  const prior = edits.find((e) => e.now === was);
  const origin = prior ? prior.was : was;
  const rest = edits.filter((e) => e !== prior);
  return origin === now ? rest : [...rest, { was: origin, now }];
}
