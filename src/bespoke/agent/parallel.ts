/**
 * Building a film with agents in parallel: a lead writes the foundation
 * (theme, shared components, the stage in scene/index.tsx), one agent per
 * beat writes that beat in scene/beats/<id>.tsx at the same time as the
 * others, and the lead then joins them up. These are the file rules that
 * keep them out of each other's way.
 */

export const BEATS_DIR = "scene/beats/";
/** The registry of beat components the stage renders with <Beats of={BEATS} />. Generated; nobody writes it. */
export const BEATS_INDEX = "scene/beats/index.ts";

export const beatFile = (id: string) => `${BEATS_DIR}${id}.tsx`;

/** A beat's own files: its component and any helpers in its folder. */
export const ownsBeat = (id: string) => (path: string) => path === beatFile(id) || path.startsWith(`${BEATS_DIR}${id}/`);

/** Which beat a path belongs to, if any. */
export const beatOf = (path: string): string | null => {
  if (!path.startsWith(BEATS_DIR) || path === BEATS_INDEX) return null;
  return /^scene\/beats\/([A-Za-z0-9_-]+?)(?:\.tsx?|\/.*)$/.exec(path)?.[1] ?? null;
};

/** A beat no agent has finished yet: renders nothing. */
export const stubBeat = (id: string) => `// Beat ${id}: its agent writes this file.\nexport default function Beat() {\n  return null;\n}\n`;

export function beatsIndex(ids: string[]): string {
  const name = (id: string) => `Beat${id.replace(/[^A-Za-z0-9]/g, "_")}`;
  return [
    "// Generated: one import per beat. Each beat's own agent writes its file; do not edit this one.",
    'import type { ComponentType } from "react";',
    ...ids.map((id) => `import ${name(id)} from "./${id}";`),
    "",
    `export const BEATS: Record<string, ComponentType> = { ${ids.map((id) => `${id}: ${name(id)}`).join(", ")} };`,
    "",
  ].join("\n");
}

/**
 * What one beat agent compiles and renders: everything shared as it is now,
 * its own files as it is writing them, and every other beat as its last
 * version that passed the check (or the stub), so a neighbour half-way
 * through an edit never breaks its build.
 */
export function beatView(id: string, files: Record<string, string>, good: Record<string, Record<string, string>>): Record<string, string> {
  const own = ownsBeat(id);
  const out: Record<string, string> = {};
  for (const [p, src] of Object.entries(files)) {
    const b = beatOf(p);
    if (b === null || own(p)) out[p] = src;
  }
  for (const [b, snap] of Object.entries(good)) if (b !== id) Object.assign(out, snap);
  return out;
}

/** A beat's files as they are now, to keep as its last good version. */
export const snapshotBeat = (id: string, files: Record<string, string>) => Object.fromEntries(Object.entries(files).filter(([p]) => ownsBeat(id)(p)));

/** Runs tasks with at most `limit` at a time; results in the order given. */
export async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < tasks.length; i = next++) {
      try {
        out[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (reason) {
        out[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}
