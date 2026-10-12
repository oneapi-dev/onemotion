import { interpolate } from "remotion";
import { clamp, easeOut } from "./motion";

/**
 * Font size so `text` fits `lines` lines of `width` px, never above `max`.
 * `ratio` is the face's average glyph width per px of size.
 */
export function fit(text: string, width: number, max: number, lines = 1, ratio = 0.55): number {
  const chars = Math.max(1, [...(text || "")].length);
  return Math.floor(Math.min(max, (width * lines) / (chars * ratio)));
}

/** "$5" counts 0 → 5, "10k+" 0 → 10, "99.9%" with one decimal; text stays text. */
function splitValue(value: string) {
  const m = /^(\D*?)(\d[\d.,]*)(.*)$/.exec(value.trim());
  if (!m) return null;
  const [, prefix, digits, suffix] = m;
  const dec = /[.,](\d{1,2})$/.exec(digits);
  const decimals = dec ? dec[1].length : 0;
  const decimalSep = dec ? digits[digits.length - decimals - 1] : "";
  const groupSep = digits.replace(/\d/g, "").replace(decimalSep, "")[0] ?? "";
  const intPart = dec ? digits.slice(0, digits.length - decimals - 1) : digits;
  const number = Number(intPart.replace(/\D/g, "") + (dec ? `.${dec[1]}` : ""));
  if (!Number.isFinite(number)) return null;
  return (n: number) => {
    const [i, f] = n.toFixed(decimals).split(".");
    const grouped = groupSep ? i.replace(/\B(?=(\d{3})+(?!\d))/g, groupSep) : i;
    return prefix + grouped + (f ? decimalSep + f : "") + suffix;
  };
}

/** The number in `value` counting up between frames start and end. */
export function countAt(value: string, frame: number, start: number, end: number): string {
  // "V2.6" or "GPT-5" is a name, not a quantity: it never counts.
  const lead = /^(\D*)/.exec(value.trim())?.[1] ?? "";
  if (/[a-z]/i.test(lead.replace(/^(rp|us\$|usd|idr|eur)\s?/i, ""))) return value;
  const format = splitValue(value);
  if (!format) return value;
  const m = /(\d[\d.,]*)/.exec(value);
  const target = Number((m?.[1] ?? "0").replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
  const n = interpolate(frame, [start, end], [0, Number.isFinite(target) ? target : 0], { ...clamp, easing: easeOut });
  return format(n);
}

/** The first number in a display value ("$0.4" -> 0.4, "1,048,576" -> 1048576), or null. */
export function numberIn(value: string): number | null {
  const m = /(\d[\d.,]*)/.exec(value ?? "");
  if (!m) return null;
  const n = Number(m[1].replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
