import type { PlanItem } from "./plan";

// Timings shared by the cards and the soundtrack, so a pop lands on the
// frame a check mark draws.

/** When each chat message arrives, and when an AI reply types. */
export function chatTimes(items: PlanItem[], frames: number) {
  const start = 10;
  const end = Math.max(start + 20, frames - 26);
  const weights = items.map((it) => 1 + (it.body?.length ?? 0) / 45);
  const sum = weights.reduce((a, w) => a + w, 0) || 1;
  let at = start;
  return items.map((it, i) => {
    const span = ((end - start) * weights[i]) / sum;
    const ai = it.title === "ai";
    const t = {
      at: Math.round(at),
      typeFrom: Math.round(at + (ai ? 12 : 0)),
      typeTo: Math.round(at + (ai ? 12 : 0) + span * 0.62),
    };
    at += span;
    return t;
  });
}

/** When each checklist row ticks. */
export function checkTimes(count: number, frames: number): number[] {
  const gap = Math.max(8, Math.min(20, (frames - 46) / Math.max(1, count)));
  return Array.from({ length: count }, (_, i) => Math.round(16 + i * gap));
}

/** When each kinetic word takes the screen. */
export function kineticTimes(count: number, frames: number): number[] {
  const slot = frames / Math.max(1, count);
  return Array.from({ length: count }, (_, i) => Math.round(i * slot));
}

// A light highlighter: comments, strings, numbers and keywords. Enough to
// read as code at a glance; it never has to parse.
const TOKEN =
  /(\/\/.*$|#.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`[^`]*`?)|(\b\d[\d._]*\b)|(\b(?:import|from|export|const|let|var|await|async|return|def|class|function|new|if|else|for|in|of|print|curl|true|false|None|null)\b)/g;

export function tokens(
  line: string,
): {
  text: string;
  kind: "plain" | "comment" | "string" | "number" | "keyword";
}[] {
  const out: {
    text: string;
    kind: "plain" | "comment" | "string" | "number" | "keyword";
  }[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: line.slice(last, at), kind: "plain" });
    out.push({
      text: m[0],
      kind: m[1] ? "comment" : m[2] ? "string" : m[3] ? "number" : "keyword",
    });
    last = at + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), kind: "plain" });
  return out;
}
