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

/** Narration text as a speaker of `lang` reads it aloud. */
export function spoken(text: string, lang: string): string {
  if (lang !== "id" && lang !== "en") return text;
  const L = lang as Lang;
  let s = text;
  // Web addresses: "oneapi.id" → "oneapi dot id" / "oneapi dot I D".
  s = s.replace(/\b([\p{L}][\p{L}\d-]*)\.(id|com|io|ai|app|dev|co|net|org|xyz|me|sh|tech|gg|tv)\b/giu, (_, name: string, tld: string) => {
    const t = tld.toLowerCase();
    return `${name} dot ${L === "en" ? (TLD_SAID[t] ?? t) : t}`;
  });
  // Rupiah: "Rp 10.000" or "Rp10rb".
  s = s.replace(new RegExp(`Rp\\.?\\s?(\\d+(?:[.,]\\d+)*)${END}`, "gu"), (_, n: string) => `${numberWords(Number(n.replace(/[.,]/g, "")), L)} rupiah`);
  // Dollars, with an optional scale: "$5", "$0.07", "$1M".
  s = s.replace(new RegExp(`\\$(\\d+(?:[.,]\\d+)?)([kKMB])?(\\+)?${END}`, "gu"), (_, n: string, unit: string | undefined, plus: string | undefined) => {
    const amount = unit ? scaledWords(n, unit, Boolean(plus), L) : amountWords(n, L);
    if (L === "id") return `${amount} dolar`;
    return `${amount} ${n === "1" && !unit ? "dollar" : "dollars"}`;
  });
  // Percentages: "40%".
  s = s.replace(new RegExp(`${FREE}(\\d+(?:[.,]\\d+)?)\\s?%`, "gu"), (_, n: string) => `${amountWords(n, L)} ${L === "id" ? "persen" : "percent"}`);
  // Multiples: "5x" (an Indonesian "5x lipat" already says lipat once).
  s = s.replace(new RegExp(`${FREE}(\\d+(?:[.,]\\d+)?)[x×]${END}(?:\\s+lipat\\b)?`, "gu"), (_, n: string) => `${amountWords(n, L)} ${L === "id" ? "kali lipat" : "times"}`);
  // Scaled counts: "1M", "10k+".
  s = s.replace(new RegExp(`${FREE}(\\d+(?:[.,]\\d+)?)([kKMB])(\\+)?${END}`, "gu"), (_, n: string, unit: string, plus: string | undefined) => scaledWords(n, unit, Boolean(plus), L));
  // Everything else that is a bare number.
  s = s.replace(new RegExp(`${FREE}(\\d+(?:[.,]\\d+)?)${END}`, "gu"), (_, n: string) => amountWords(n, L));
  return s.replace(/ {2,}/g, " ");
}
