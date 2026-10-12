// Small text helpers shared by the director's rules and its fact checks.

export function runes(s: string): number {
  return [...s].length;
}

export function clipRunes(s: string, n: number): string {
  const r = [...s];
  return r.length <= n ? s : r.slice(0, n).join("");
}

/**
 * Trims and cuts to n characters at a word boundary when it can. Em dashes
 * are replaced: on-screen text never carries them.
 */
export function fitText(s: string | undefined, n: number): string {
  let v = (s ?? "").replaceAll(" — ", ", ").replaceAll("—", ", ").trim();
  v = v.split(/\s+/).filter(Boolean).join(" ");
  if (runes(v) <= n) return v;
  let cut = [...v].slice(0, n).join("");
  const space = cut.lastIndexOf(" ");
  if (space > n / 2) cut = cut.slice(0, space);
  return cut.replace(/[ ,.;:-]+$/, "");
}

export function firstNonEmpty(...vals: (string | undefined | null)[]): string {
  for (const v of vals) if (v && v.trim()) return v.trim();
  return "";
}

/** "#ABC", "abcdef", "rgb(…)" → "#abcdef", or "" when it is not a color. */
export function normalizeHex(v: string | undefined | null): string {
  const s = (v ?? "").trim().toLowerCase();
  let m = /^#?([0-9a-f]{6})$/.exec(s);
  if (m) return `#${m[1]}`;
  m = /^#?([0-9a-f]{3})$/.exec(s);
  if (m) return `#${m[1].split("").map((c) => c + c).join("")}`;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(s);
  if (rgb) return `#${rgb.slice(1, 4).map((x) => Math.min(255, Number(x)).toString(16).padStart(2, "0")).join("")}`;
  return "";
}

export const words = (s: string | undefined) => (s ?? "").split(/\s+/).filter(Boolean).length;
