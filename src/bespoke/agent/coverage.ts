/**
 * Whether a built film puts its storyboard on screen: each beat's words
 * ("says") should be in the scene's source. A film that shows none of them
 * (a model that drew a debug dump, or a blank stage) is not a finished film,
 * whatever its agent says. Pure: reads the beats and the files.
 */

const STOP = new Set(["with", "your", "this", "that", "from", "into", "they", "them", "then", "than", "have", "will", "what", "when", "only", "just", "more", "same", "very", "each", "over", "under", "about", "yang", "dan", "untuk", "dengan", "dari", "atau", "pada", "tidak", "bisa", "lebih"]);

/** The words and figures of a line that would be on screen: numbers (with $ and %), and words of four letters or more. */
export function keyTokens(says: string): { figures: string[]; words: string[] } {
  const figures = (says.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
  const words = (says.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter((w) => !STOP.has(w));
  return { figures: [...new Set(figures)], words: [...new Set(words)] };
}

/**
 * The figures each beat promises (a price, a percentage, a version) that the
 * film never shows, by beat: a beat whose other figures are there still
 * misses these. Each figure is looked for as written and without trailing
 * zeros ("0.30" or "0.3"). Beats with no missing figure are left out.
 */
export function missingFigures(beats: { id: string; says: string }[], files: Record<string, string>): { id: string; figures: string[] }[] {
  const src = Object.values(files).join("\n");
  const has = (f: string) => src.includes(f) || (f.includes(".") && src.includes(f.replace(/0+$/, "").replace(/\.$/, "")));
  return beats.map((b) => ({ id: b.id, figures: keyTokens(b.says).figures.filter((f) => !has(f)) })).filter((x) => x.figures.length > 0);
}

/**
 * The beats whose words are not in the source: none of their figures, and
 * fewer than 40 % of their words. Beats with nothing to show count as shown.
 */
export function unshownBeats(beats: { id: string; says: string }[], files: Record<string, string>): string[] {
  const src = Object.values(files).join("\n").toLowerCase();
  return beats
    .filter((b) => {
      const { figures, words } = keyTokens(b.says);
      if (!figures.length && !words.length) return false;
      if (figures.some((f) => src.includes(f))) return false;
      const found = words.filter((w) => src.includes(w)).length;
      return !words.length || found / words.length < 0.4;
    })
    .map((b) => b.id);
}
