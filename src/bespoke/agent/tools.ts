"use client";

import { DIMENSIONS } from "@/engine/plan";
import type { FilmSpec } from "../film";
import type { Sandbox } from "../host";
import { filmTiming } from "../timing";
import { scaled, sheet } from "./images";

export type ToolResult = { text: string; images?: { label: string; url: string }[]; done?: boolean };
export type AgentTool = { name: string; description: string; parameters: Record<string, unknown>; run: (args: Record<string, unknown>) => Promise<ToolResult> };

/** The scene being built: its files, and the compiled modules of the last version that passed the check. */
export type Workspace = {
  spec: FilmSpec;
  /** Everything the film may state: a number on screen that is not in here fails the check. */
  facts: string;
  files: Record<string, string>;
  modules: Record<string, string> | null;
  /** Files changed since the last check. */
  dirty: boolean;
};

export type CheckResult = { ok: boolean; errors: string[]; modules: Record<string, string> };

/** Checks and compiles the files on the server. */
export async function compile(files: Record<string, string>, facts: string, signal?: AbortSignal): Promise<CheckResult> {
  const res = await fetch("/api/scene/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files, facts }), signal });
  const body = (await res.json().catch(() => null)) as (CheckResult & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `The check failed (${res.status}).`);
  return body;
}

const PATH = /^scene\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.tsx?$/;
const lines = (s: string) => s.split("\n").length;

/** The frames that show a film best: its first frame, two-thirds into every beat, and the close. */
export function keyFrames(spec: FilmSpec): number[] {
  const { timing, beats } = filmTiming(spec.beats, spec.score);
  return [4, ...beats.map((b) => Math.round(b.start + (b.end - b.start) * 0.65)), timing.total - 20];
}

/**
 * The agent's tools. They change `ws` in place and call `changed` after
 * every change, so the Studio can save it and refresh the preview.
 */
export function sceneTools(ws: Workspace, sandbox: Sandbox, changed: () => void, signal?: AbortSignal): AgentTool[] {
  const { width: W, height: H } = DIMENSIONS[ws.spec.format];
  const path = (a: Record<string, unknown>) => {
    const p = String(a.path ?? "").replace(/^\.?\//, "");
    if (!PATH.test(p) || p.includes("..")) throw new Error(`"${p}": files live in scene/ and end in .tsx or .ts`);
    return p;
  };
  const write = (p: string, src: string) => {
    ws.files[p] = src;
    ws.dirty = true;
    changed();
  };
  /** Compiles when files changed; the preview follows every version that passes. */
  const ensure = async (): Promise<string | null> => {
    if (!ws.dirty && ws.modules) return null;
    const r = await compile(ws.files, ws.facts, signal);
    if (!r.ok) return `Not rendered. Fix these first:\n- ${r.errors.join("\n- ")}`;
    ws.modules = r.modules;
    ws.dirty = false;
    changed();
    return null;
  };
  const film = () => ({ spec: ws.spec, modules: ws.modules ?? {} });
  const total = filmTiming(ws.spec.beats, ws.spec.score).timing.total;

  return [
    {
      name: "timing",
      description: "The beats in frames, the format, the brand and the safe area. Call this first.",
      parameters: { type: "object", properties: {} },
      run: async () => {
        const { beats } = filmTiming(ws.spec.beats, ws.spec.score);
        const P = H > W;
        const safe = P ? `x 60 to ${W - 60}, y ${Math.round(H * 0.07)} to ${Math.round(H * 0.86)}` : `x 100 to ${W - 100}, y 70 to ${H - 90}`;
        return {
          text: [
            `Format ${ws.spec.format}: ${W} x ${H} at 30 fps, ${total} frames (${(total / 30).toFixed(1)} s).`,
            ...beats.map((b) => `${b.id}: frames ${b.start} to ${b.end} | says "${b.says}" | shows: ${b.shows}`),
            `Safe area: ${safe}.`,
            `Brand: ${JSON.stringify({ ...ws.spec.brand, logo: ws.spec.brand.logo ? "(an image; draw it with <Mark/>)" : null })}`,
            `Music: ${ws.spec.score.genre} at ${ws.spec.score.bpm} bpm; beats start on its beat grid, so hits on beat starts land with the music.`,
          ].join("\n"),
        };
      },
    },
    {
      name: "list_files",
      description: "List the files in scene/.",
      parameters: { type: "object", properties: {} },
      run: async () => ({ text: Object.keys(ws.files).map((f) => `${f} (${lines(ws.files[f])} lines)`).join("\n") || "(empty: start with your components, then scene/index.tsx)" }),
    },
    {
      name: "read_file",
      description: "Read a file in scene/.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      run: async (a) => {
        const p = path(a);
        return { text: ws.files[p] ?? "not found" };
      },
    },
    {
      name: "write_file",
      description: "Create or overwrite a file in scene/ (scene/index.tsx, scene/components/Name.tsx).",
      parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
      run: async (a) => {
        const p = path(a);
        write(p, String(a.content ?? ""));
        return { text: `wrote ${p} (${lines(ws.files[p])} lines)` };
      },
    },
    {
      name: "edit_file",
      description: "Replace an exact string in a scene/ file. old_string must occur once, unless replace_all.",
      parameters: { type: "object", properties: { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" }, replace_all: { type: "boolean" } }, required: ["path", "old_string", "new_string"] },
      run: async (a) => {
        const p = path(a);
        const src = ws.files[p];
        if (src === undefined) return { text: `${p} does not exist` };
        const old = String(a.old_string ?? "");
        const count = old ? src.split(old).length - 1 : 0;
        if (!count) return { text: "old_string not found: read the file and copy the exact text" };
        if (count > 1 && !a.replace_all) return { text: `old_string occurs ${count} times: add context, or set replace_all` };
        write(p, a.replace_all ? src.split(old).join(String(a.new_string ?? "")) : src.replace(old, () => String(a.new_string ?? "")));
        return { text: `edited ${p}` };
      },
    },
    {
      name: "delete_file",
      description: "Delete a file in scene/.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      run: async (a) => {
        const p = path(a);
        delete ws.files[p];
        ws.dirty = true;
        changed();
        return { text: `deleted ${p}` };
      },
    },
    {
      name: "check",
      description: "Run the scene rules (imports, determinism) and the TypeScript compiler. A passing scene shows in the live preview.",
      parameters: { type: "object", properties: {} },
      run: async () => {
        const r = await compile(ws.files, ws.facts, signal);
        if (!r.ok) return { text: `${r.errors.length} problem(s):\n- ${r.errors.join("\n- ")}` };
        ws.modules = r.modules;
        ws.dirty = false;
        changed();
        return { text: "ok: no problems" };
      },
    },
    {
      name: "render_frames",
      description: "Render up to 6 frames and look at them. The frames are exactly what the exported video draws.",
      parameters: { type: "object", properties: { frames: { type: "array", items: { type: "number" } } }, required: ["frames"] },
      run: async (a) => {
        const blocked = await ensure();
        if (blocked) return { text: blocked };
        const frames = (Array.isArray(a.frames) ? a.frames : []).slice(0, 6).map((x) => Math.max(0, Math.min(total - 1, Math.round(Number(x) || 0))));
        if (!frames.length) return { text: "Give the frames to render." };
        try {
          const r = await sandbox.stills(film(), frames, signal);
          const urls = await Promise.all(r.images.map((b) => scaled(b, H > W ? 540 : 960)));
          return { text: `rendered frames ${frames.join(", ")}${r.warnings.length ? `\nwarnings:\n- ${r.warnings.join("\n- ")}` : ""}`, images: urls.map((url, i) => ({ label: `frame ${frames[i]}`, url })) };
        } catch (err) {
          return { text: `The scene crashed while rendering: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    },
    {
      name: "contact_sheet",
      description: "Render the key moments (the first frame, two-thirds into every beat, the close) as one tiled image: the fastest way to judge the whole film.",
      parameters: { type: "object", properties: {} },
      run: async () => {
        const blocked = await ensure();
        if (blocked) return { text: blocked };
        const frames = keyFrames(ws.spec).map((f) => Math.max(0, Math.min(total - 1, f)));
        try {
          const r = await sandbox.stills(film(), frames, signal);
          const P = H > W;
          const cols = P ? 5 : W === H ? 4 : 3;
          const url = await sheet(r.images, frames.map((f) => `frame ${f}`), cols, P ? 300 : W === H ? 420 : 640);
          return { text: `contact sheet: frames ${frames.join(", ")} (left to right, top to bottom)`, images: [{ label: `contact sheet, frames ${frames.join(", ")}`, url }] };
        } catch (err) {
          return { text: `The scene crashed while rendering: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    },
    {
      name: "finish",
      description: "Call when the film is finished and you have looked at rendered frames of it.",
      parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
      run: async (a) => ({ text: String(a.summary ?? "done"), done: true }),
    },
  ];
}
