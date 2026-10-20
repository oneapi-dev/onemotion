/**
 * Narration as a speaker says it. The director writes numbers the way they
 * appear on screen ("$5", "5x", "1M", "oneapi.id"), so the fact check that
 * guards on-screen text guards the voiceover too; this turns them into words
 * in the narration's language before a voice reads them. Languages without
 * rules here are left for the voice model to read as it can.
 */

type Lang = "id" | "en";

const ID_UNITS = ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
const EN_UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function idWords(n: number): string {
  if (n < 12) return ID_UNITS[n];
  if (n < 20) return `${ID_UNITS[n - 10]} belas`;
  if (n < 100) return `${ID_UNITS[Math.floor(n / 10)]} puluh${n % 10 ? ` ${ID_UNITS[n % 10]}` : ""}`;
  const big: [number, string, string][] = [
    [1e12, "triliun", ""],
    [1e9, "miliar", ""],
    [1e6, "juta", ""],
    [1000, "ribu", "seribu"],
    [100, "ratus", "seratus"],
  ];
  for (const [size, word, one] of big) {
    if (n < size) continue;
    const head = Math.floor(n / size);
    const rest = n % size;
    const lead = head === 1 && one ? one : `${idWords(head)} ${word}`;
    return rest ? `${lead} ${idWords(rest)}` : lead;
  }
  return String(n);
}

function enWords(n: number): string {
  if (n < 20) return EN_UNITS[n];
  if (n < 100) return `${EN_TENS[Math.floor(n / 10)]}${n % 10 ? `-${EN_UNITS[n % 10]}` : ""}`;
  const big: [number, string][] = [
    [1e12, "trillion"],
    [1e9, "billion"],
    [1e6, "million"],
    [1000, "thousand"],
    [100, "hundred"],
  ];
  for (const [size, word] of big) {
    if (n < size) continue;
    const rest = n % size;
    const lead = `${enWords(Math.floor(n / size))} ${word}`;
    return rest ? `${lead} ${enWords(rest)}` : lead;
  }
  return String(n);
}

/** A whole number in words. */
export const numberWords = (n: number, lang: Lang) => (lang === "id" ? idWords(n) : enWords(n));

/**
 * A number as written ("0.07", "1.250", "2,5") in words. A separator followed
 * by exactly three digits after a non-zero part groups thousands; any other
 * is a decimal point, read digit by digit after it.
 */
function amountWords(raw: string, lang: Lang): string {
  const m = /^(\d+)(?:[.,](\d+))?$/.exec(raw);
  if (!m) return raw;
  const [, whole, frac] = m;
  if (frac && frac.length === 3 && Number(whole) > 0 && !/[.,]\d{1,2}$/.test(raw)) return numberWords(Number(whole + frac), lang);
  const head = numberWords(Number(whole), lang);
  if (!frac) return head;
  return `${head} ${lang === "id" ? "koma" : "point"} ${[...frac].map((d) => numberWords(Number(d), lang)).join(" ")}`;
}

const SCALE: Record<string, [number, string, string]> = {
  k: [1e3, "ribu", "thousand"],
  K: [1e3, "ribu", "thousand"],
  M: [1e6, "juta", "million"],
  B: [1e9, "miliar", "billion"],
};

/** "1M", "2.5k", "10k+" in words. */
function scaledWords(num: string, unit: string, plus: boolean, lang: Lang): string {
  const [, id, en] = SCALE[unit];
  const said = `${amountWords(num, lang)} ${lang === "id" ? id : en}`;
  return plus ? `${lang === "id" ? "lebih dari" : "over"} ${said}` : said;
}

// A number glued to letters ("V2.6", "GPT-4o", "H100") is a name: the voice reads it.
const FREE = "(?<![\\p{L}\\d.,-])";
const END = "(?![\\p{L}\\d])";

const TLD_SAID: Record<string, string> = { id: "I D", ai: "A I", io: "I O", co: "C O", sh: "S H", gg: "G G", tv: "T V", me: "me" };

/**
 * One pronunciation: how `term` is said. `lang` limits it to one narration
 * language (ISO 639-1); without it, it applies to every language. A term in
 * capitals ("AI", "API") matches only in capitals; any other term matches
 * in any case ("OneAPI" also matches "oneapi").
 */
export type Pronunciation = { term: string; say: string; lang?: string };

/** A rule over the display text: what it matches, and what is said instead. */
type Rule = { re: RegExp; say: (m: RegExpExecArray) => string };

/** A piece of the spoken text and the display text it stands for: display[from, to) is said as tts[at, end). */
export type SpeechSpan = { from: number; to: number; at: number; end: number };

/**
 * A narration line made ready for a voice: `tts` is what is sent to the
 * voice, `display` what the viewer reads, and `spans` map one to the other,
 * so word times measured on the spoken text can be put back on the words
 * as written.
 */
export type Speech = { display: string; tts: string; spans: SpeechSpan[] };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORDY = /[\p{L}\p{N}_]/u;

/** The pronunciations that apply to `lang`, longest term first, a language's own before the global ones. */
export function lexiconFor(lexicon: readonly Pronunciation[], lang: string): Pronunciation[] {
  return lexicon
    .filter((p) => p.term.trim() && (!p.lang || p.lang === lang))
    .sort((a, b) => b.term.trim().length - a.term.trim().length || Number(Boolean(b.lang)) - Number(Boolean(a.lang)));
}

function lexiconRules(lexicon: readonly Pronunciation[], lang: string): Rule[] {
  return lexiconFor(lexicon, lang).map((p) => {
    const term = p.term.trim();
    // Word edges only where the term itself starts or ends with a letter or digit: "AI" never matches inside "MAIN".
    const head = WORDY.test(term[0]) ? "(?<![\\p{L}\\p{N}_])" : "";
    const tail = WORDY.test(term[term.length - 1]) ? "(?![\\p{L}\\p{N}_])" : "";
    const caps = /\p{Lu}/u.test(term) && !/\p{Ll}/u.test(term);
    return { re: new RegExp(`${head}${escape(term)}${tail}`, caps ? "gu" : "giu"), say: () => p.say.trim() };
  });
}

function numberRules(L: Lang): Rule[] {
  return [
    // Web addresses: "oneapi.id" → "oneapi dot id" / "oneapi dot I D".
    {
      re: /\b([\p{L}][\p{L}\d-]*)\.(id|com|io|ai|app|dev|co|net|org|xyz|me|sh|tech|gg|tv)\b/giu,
      say: (m) => {
        const t = m[2].toLowerCase();
        return `${m[1]} dot ${L === "en" ? (TLD_SAID[t] ?? t) : t}`;
      },
    },
    // Rupiah: "Rp 10.000" or "Rp10rb".
    { re: new RegExp(`Rp\\.?\\s?(\\d+(?:[.,]\\d+)*)${END}`, "gu"), say: (m) => `${numberWords(Number(m[1].replace(/[.,]/g, "")), L)} rupiah` },
    // Dollars, with an optional scale: "$5", "$0.07", "$1M".
    {
      re: new RegExp(`\\$(\\d+(?:[.,]\\d+)?)([kKMB])?(\\+)?${END}`, "gu"),
      say: (m) => {
        const amount = m[2] ? scaledWords(m[1], m[2], Boolean(m[3]), L) : amountWords(m[1], L);
        if (L === "id") return `${amount} dolar`;
        return `${amount} ${m[1] === "1" && !m[2] ? "dollar" : "dollars"}`;
      },
    },
    // Percentages: "40%".
    { re: new RegExp(`${FREE}(\\d+(?:[.,]\\d+)?)\\s?%`, "gu"), say: (m) => `${amountWords(m[1], L)} ${L === "id" ? "persen" : "percent"}` },
    // Multiples: "5x" (an Indonesian "5x lipat" already says lipat once).
    { re: new RegExp(`${FREE}(\\d+(?:[.,]\\d+)?)[x×]${END}(?:\\s+lipat\\b)?`, "gu"), say: (m) => `${amountWords(m[1], L)} ${L === "id" ? "kali lipat" : "times"}` },
    // Scaled counts: "1M", "10k+".
    { re: new RegExp(`${FREE}(\\d+(?:[.,]\\d+)?)([kKMB])(\\+)?${END}`, "gu"), say: (m) => scaledWords(m[1], m[2], Boolean(m[3]), L) },
    // Everything else that is a bare number.
    { re: new RegExp(`${FREE}(\\d+(?:[.,]\\d+)?)${END}`, "gu"), say: (m) => amountWords(m[1], L) },
  ];
}

/**
 * Narration text as a speaker of `lang` reads it aloud: the pronunciations
 * first (longest term first), then numbers, prices and web addresses in
 * words (Indonesian and English only; other languages are left for the
 * voice model). Every rule matches the text as written, and what one rule
 * replaced no later rule touches, so the result maps back to the display
 * text piece by piece.
 */
export function speech(text: string, lang: string, lexicon: readonly Pronunciation[] = []): Speech {
  const rules = [...lexiconRules(lexicon, lang), ...(lang === "id" || lang === "en" ? numberRules(lang) : [])];
  const taken: { from: number; to: number; say: string }[] = [];
  const free = (a: number, b: number) => taken.every((t) => b <= t.from || a >= t.to);
  for (const r of rules) {
    for (const m of text.matchAll(r.re)) {
      const at = m.index ?? 0;
      if (m[0].length && free(at, at + m[0].length)) taken.push({ from: at, to: at + m[0].length, say: r.say(m as RegExpExecArray) });
    }
  }
  taken.sort((a, b) => a.from - b.from);
  // The spoken text, one span per replacement and per character kept, never two spaces in a row.
  let tts = "";
  const spans: SpeechSpan[] = [];
  const emit = (out: string, from: number, to: number) => {
    const s = tts.endsWith(" ") ? out.replace(/^ +/, "") : out;
    const at = tts.length;
    tts += s;
    spans.push({ from, to, at, end: tts.length });
  };
  let i = 0;
  for (const t of taken) {
    for (; i < t.from; i++) emit(text[i], i, i + 1);
    emit(t.say, t.from, t.to);
    i = t.to;
  }
  for (; i < text.length; i++) emit(text[i], i, i + 1);
  return { display: text, tts, spans };
}

/** Narration text as a speaker of `lang` reads it aloud (the spoken text of speech()). */
export const spoken = (text: string, lang: string, lexicon: readonly Pronunciation[] = []): string => speech(text, lang, lexicon).tts;

/** The range of the spoken text that says display[from, to); a replaced piece only partly covered gives its share. */
export function spokenRange(s: Speech, from: number, to: number): [number, number] | null {
  let a = Infinity;
  let b = -Infinity;
  for (const sp of s.spans) {
    const lo = Math.max(from, sp.from);
    const hi = Math.min(to, sp.to);
    if (lo >= hi || sp.end <= sp.at) continue;
    const k = (sp.end - sp.at) / (sp.to - sp.from);
    a = Math.min(a, sp.at + Math.floor((lo - sp.from) * k));
    b = Math.max(b, sp.at + Math.ceil((hi - sp.from) * k));
  }
  return a < b ? [a, b] : null;
}

/** When each character of the spoken text is said, in seconds from the start of the audio. */
export type CharTimes = { start: number[]; end: number[] };

/**
 * The display text's words with the times they are spoken: each word takes
 * the times of the spoken characters that say it ("$5" spans "five
 * dollars"). A word with nothing spoken for it sits between its neighbours.
 */
export function displayWords(s: Speech, times: CharTimes): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number; said: boolean }[] = [];
  for (const m of s.display.matchAll(/\S+/g)) {
    const from = m.index ?? 0;
    const r = spokenRange(s, from, from + m[0].length);
    let start = Infinity;
    let end = -Infinity;
    if (r)
      for (let i = r[0]; i < r[1]; i++) {
        if (/\s/.test(s.tts[i] ?? " ") || times.start[i] === undefined) continue;
        start = Math.min(start, times.start[i]);
        end = Math.max(end, times.end[i] ?? times.start[i]);
      }
    out.push({ text: m[0], start, end, said: start <= end });
  }
  out.forEach((w, i) => {
    if (w.said) return;
    const prev = out.slice(0, i).reverse().find((x) => x.said);
    const next = out.slice(i + 1).find((x) => x.said);
    w.start = w.end = prev ? prev.end : next ? next.start : 0;
  });
  return out.map((w) => ({ text: w.text, start: Math.round(w.start * 1000) / 1000, end: Math.round(w.end * 1000) / 1000 }));
}

/** The pronunciations a new studio starts with: the person can change or remove them. */
export const DEFAULT_PRONUNCIATIONS: Pronunciation[] = [
  { term: "OneAPI", say: "wanapi" },
  { term: "oneapi.id", say: "wanapi" },
];

/** Several dictionaries as one: for the same term and language, the earlier list wins (a project's over the studio's). */
export function mergeLexicons(...lists: (readonly Pronunciation[] | undefined)[]): Pronunciation[] {
  const seen = new Set<string>();
  const out: Pronunciation[] = [];
  for (const list of lists)
    for (const p of list ?? []) {
      const k = `${p.term.trim().toLowerCase()}|${p.lang ?? ""}`;
      if (!p.term.trim() || seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
  return out;
}
