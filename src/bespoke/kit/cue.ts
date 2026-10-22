// The syntax of a film cue, shared by the kit (which reads cues at render) and the scene check
// (which rejects one it cannot read before any frame is drawn).

// The word part may be a phrase ("b2:satu integrasi"): models cue on the words they mean, and a phrase is matched as a whole.
export const CUE = /^([A-Za-z0-9_-]+)(?::([^#@+]+?)(?:#(\d+))?)?(\.end|@(\d*\.?\d+))?([+-]\d*\.?\d+)?$/;

/** A cue as the kit reads it: "b3:+0.4", "b3:@0.5" and "b3:end" are what models write for "b3+0.4", "b3@0.5" and "b3.end". */
export const cueForm = (c: string) =>
  c
    .trim()
    .replace(/^([A-Za-z0-9_-]+):\s*([+-]\d*\.?\d+|@\d*\.?\d+)$/, "$1$2")
    .replace(/^([A-Za-z0-9_-]+):\s*end$/, "$1.end");

/** Why a film cue written as a literal cannot be read (null when it can): a wrong one stops the film at render. */
export function cueProblem(c: string): string | null {
  const s = cueForm(c);
  if (s === "end" || CUE.test(s)) return null;
  return `cue("${c}") cannot be read: use "b3", "b3:word", "b3+0.4", "b3.end", "b3@0.5" or "end"`;
}
