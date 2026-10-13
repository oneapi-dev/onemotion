/**
 * Numbers on screen must come from the facts. Adapted from
 * remotion-opus-skill's linter (MIT, (c) 2026 direkturcrypto).
 */

/** The numbers in a text, separators dropped: "Rp3.600" and "3,600" are both "3600". */
export const numTokens = (s: string) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((x) => x.replace(/[.,]/g, ""));

/** Every number the facts state, with their compact forms expanded (5K is 5000, 2 juta is 2000000). */
export function factNumbers(facts: string): Set<string> {
  const set = new Set(numTokens(facts));
  for (const m of facts.matchAll(/(\d+(?:[.,]\d+)?)\s?(K|M|B|rb|ribu|juta|million|billion)\b/gi)) {
    const n = parseFloat(m[1].replace(",", "."));
    const mult = /^(k|rb|ribu)$/i.test(m[2]) ? 1e3 : /^(m|juta|million)$/i.test(m[2]) ? 1e6 : 1e9;
    set.add(String(Math.round(n * mult)));
  }
  return set;
}

/** Numbers in on-screen text that the facts do not state. One-digit numbers and small counts (up to 12) are free: steps, list numbers. */
export function unknownNumbers(text: string, known: Set<string>): string[] {
  return numTokens(text).filter((n) => n.length > 1 && !known.has(n) && !(Number(n) <= 12 && n.length <= 2));
}
