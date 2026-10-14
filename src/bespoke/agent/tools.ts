"use client";

import { DIMENSIONS } from "@/engine/plan";
import type { FilmSpec } from "../film";
import type { FilmHost } from "../host";
import { filmTiming } from "../timing";
import type { SiteInfo } from "@/director/input";
import { prepareAsset, scaled, sheet } from "./images";

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

/** The most of one search's results an agent reads: enough for facts and addresses, not a flood of context. */
const MAX_SEARCH_TEXT = 6000;

/**
 * Web search as the agent's own tool, run through OneAPI's MCP server with
 * the person's key (billed per search). A failed search comes back as a
 * line the model reads, so the step around it carries on.
 */
export function webSearchTool(key: string, signal?: AbortSignal): AgentTool {
  return {
    name: "web_search",
    description:
      "Search the web for current facts: a product's real features and prices, a tool's official site, recent news. Returns ranked results with titles, URLs and excerpts. Read a result's page with look_up_page, and bring a logo in with fetch_image. Billed per search: search only for what the film needs.",
    parameters: { type: "object", properties: { query: { type: "string", description: "A specific query; include the year when recency matters." } }, required: ["query"] },
    run: async (a) => {
      try {
        const res = await fetch("/api/web", { method: "POST", headers: { "Content-Type": "application/json", "X-OneAPI-Key": key }, body: JSON.stringify({ query: String(a.query ?? "") }), signal });
        const body = (await res.json().catch(() => null)) as { text?: string; failed?: boolean; error?: string } | null;
        if (!res.ok || !body?.text) return { text: `The search failed (${body?.error ?? res.status}). Carry on with what you have.` };
        const text = body.text.length > MAX_SEARCH_TEXT ? `${body.text.slice(0, MAX_SEARCH_TEXT)}\n(results cut here)` : body.text;
        return { text: body.failed ? `The search found nothing usable: ${text}` : text };
      } catch (err) {
        if (signal?.aborted) throw err;
        return { text: `The search failed (${err instanceof Error ? err.message : String(err)}). Carry on with what you have.` };
      }
    },
  };
}

/** How many real images a film may bring in, and how heavy they may be together (they are saved with the project). */
const MAX_ASSETS = 16;
const MAX_ASSET_BYTES = 1_800_000;

const PATH = /^scene\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.tsx?$/;
const lines = (s: string) => s.split("\n").length;

/** The frames that show a film best: its first frame, two-thirds into every beat, and the close. */
export function keyFrames(spec: FilmSpec): number[] {
  const { timing, beats } = filmTiming(spec.beats, spec.score);
  return [4, ...beats.map((b) => Math.round(b.start + (b.end - b.start) * 0.65)), timing.total - 20];
}

/**
 * What one agent may touch when several build a film together: the files
 * it may write, the set of files it compiles and renders (its own work
 * with the others' last good versions), the check errors that are its
 * own, and the stretch of the film it looks at.
 */
export type ToolScope = {
  canWrite?: (path: string) => boolean;
  /** Which files this agent may write, in words, for the refusal. */
  writes?: string;
  view?: () => Record<string, string>;
  mine?: (error: string) => boolean;
  /** Called after this agent's files pass the check. */
  onPassed?: () => void;
  /** The frames this agent is responsible for: its contact sheet shows them and the seams around them. */
  focus?: { from: number; to: number; label: string };
};

/**
 * The agent's tools. They change `ws` in place and call `changed` after
 * every change, so the Studio can save it and refresh the preview.
 */
export function sceneTools(ws: Workspace, host: FilmHost, changed: () => void, signal?: AbortSignal, scope: ToolScope = {}): AgentTool[] {
  const { width: W, height: H } = DIMENSIONS[ws.spec.format];
  const view = () => scope.view?.() ?? ws.files;
  const report = (errors: string[]) => {
    const own = scope.mine ? errors.filter(scope.mine) : errors;
    return own.length ? own : errors;
  };
  const path = (a: Record<string, unknown>) => {
    const p = String(a.path ?? "").replace(/^\.?\//, "");
    if (!PATH.test(p) || p.includes("..")) throw new Error(`"${p}": files live in scene/ and end in .tsx or .ts`);
    return p;
  };
  const writable = (p: string) => {
    if (scope.canWrite && !scope.canWrite(p)) throw new Error(`"${p}" is not yours to change: you write ${scope.writes ?? "your own files"} only.`);
    return p;
  };
  const write = (p: string, src: string) => {
    ws.files[p] = src;
    ws.dirty = true;
    changed();
  };
  const passed = (modules: Record<string, string>) => {
    ws.modules = modules;
    ws.dirty = false;
    scope.onPassed?.();
    changed();
  };
  /** Compiles when files changed; the preview follows every version that passes. */
  const ensure = async (): Promise<string | null> => {
    if (!ws.dirty && ws.modules) return null;
    const r = await compile(view(), ws.facts, signal);
    if (!r.ok) return `Not rendered. Fix these first:\n- ${report(r.errors).join("\n- ")}`;
    passed(r.modules);
    return null;
  };
  const film = () => ({ spec: ws.spec, modules: ws.modules ?? {} });
  const total = filmTiming(ws.spec.beats, ws.spec.score).timing.total;
  const clampFrame = (f: number) => Math.max(0, Math.min(total - 1, Math.round(f)));
  /** The contact sheet's moments: the whole film, or this agent's stretch with the seams on either side. */
  const sheetFrames = (): { frames: number[]; labels: string[] } => {
    const f = scope.focus;
    if (!f) {
      const frames = keyFrames(ws.spec).map(clampFrame);
      return { frames, labels: frames.map((x) => `frame ${x}`) };
    }
    const len = f.to - f.from;
    const marks: [number, string][] = [
      [f.from - 8, "seam in (before)"],
      [f.from + 3, "start"],
      [f.from + len * 0.33, "a third in"],
      [f.from + len * 0.66, "two thirds in"],
      [f.to - 4, "end"],
      [f.to + 6, "seam out (after)"],
    ];
    const kept = marks.filter(([x]) => x >= 0 && x < total).map(([x, l]) => [clampFrame(x), l] as const);
    return { frames: kept.map(([x]) => x), labels: kept.map(([x, l]) => `${l}, frame ${x}`) };
  };

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
            ...beats.map(
              (b) =>
                `${b.id}: frames ${b.start} to ${b.end} | says "${b.says}" | shows: ${b.shows}${b.voice ? ` | voice (${b.spoken ? "recorded, captioned" : "not recorded: estimated times"}): "${b.voice}" | words: ${b.words.map((w) => `${w.text}@${w.at}`).join(" ")}` : ""}`,
            ),
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
      run: async () => {
        const files = view();
        return { text: Object.keys(files).map((f) => `${f} (${lines(files[f])} lines)`).join("\n") || "(empty: start with your components, then scene/index.tsx)" };
      },
    },
    {
      name: "read_file",
      description: "Read a file in scene/.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      run: async (a) => {
        const p = path(a);
        return { text: view()[p] ?? "not found" };
      },
    },
    {
      name: "write_file",
      description: `Create or overwrite a file in scene/${scope.writes ? ` (yours: ${scope.writes})` : " (scene/index.tsx, scene/components/Name.tsx)"}.`,
      parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
      run: async (a) => {
        const p = writable(path(a));
        write(p, String(a.content ?? ""));
        return { text: `wrote ${p} (${lines(ws.files[p])} lines)` };
      },
    },
    {
      name: "edit_file",
      description: "Replace an exact string in a scene/ file. old_string must occur once, unless replace_all.",
      parameters: { type: "object", properties: { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" }, replace_all: { type: "boolean" } }, required: ["path", "old_string", "new_string"] },
      run: async (a) => {
        const p = writable(path(a));
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
        const p = writable(path(a));
        delete ws.files[p];
        ws.dirty = true;
        changed();
        return { text: `deleted ${p}` };
      },
    },
    {
      name: "check",
      description: "Run the scene rules (imports, determinism, facts) and the TypeScript compiler. A passing scene shows in the live preview.",
      parameters: { type: "object", properties: {} },
      run: async () => {
        const r = await compile(view(), ws.facts, signal);
        if (!r.ok) {
          const own = report(r.errors);
          return { text: `${own.length} problem(s):\n- ${own.join("\n- ")}` };
        }
        passed(r.modules);
        return { text: "ok: no problems" };
      },
    },
    {
      name: "render_frames",
      description: `Render up to 6 frames and look at them. The frames are exactly what the exported video draws.${scope.focus ? ` Your frames are ${scope.focus.from} to ${scope.focus.to}.` : ""}`,
      parameters: { type: "object", properties: { frames: { type: "array", items: { type: "number" } } }, required: ["frames"] },
      run: async (a) => {
        const blocked = await ensure();
        if (blocked) return { text: blocked };
        const frames = (Array.isArray(a.frames) ? a.frames : []).slice(0, 6).map((x) => clampFrame(Number(x) || 0));
        if (!frames.length) return { text: "Give the frames to render." };
        try {
          const r = await host.stills(film(), frames, signal);
          const urls = await Promise.all(r.images.map((b) => scaled(b, H > W ? 540 : 960)));
          return { text: `rendered frames ${frames.join(", ")}${r.warnings.length ? `\nQA:\n- ${r.warnings.join("\n- ")}` : "\nQA: no warnings"}`, images: urls.map((url, i) => ({ label: `frame ${frames[i]}`, url })) };
        } catch (err) {
          return { text: `The scene crashed while rendering: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    },
    {
      name: "contact_sheet",
      description: scope.focus
        ? `Render your stretch (${scope.focus.label}: its start, a third in, two thirds in, its end) and the seams with the beats on either side, as one tiled image.`
        : "Render the key moments (the first frame, two-thirds into every beat, the close) as one tiled image: the fastest way to judge the whole film.",
      parameters: { type: "object", properties: {} },
      run: async () => {
        const blocked = await ensure();
        if (blocked) return { text: blocked };
        const { frames, labels } = sheetFrames();
        try {
          const r = await host.stills(film(), frames, signal);
          const P = H > W;
          const cols = P ? 5 : W === H ? 4 : 3;
          const url = await sheet(r.images, labels, cols, P ? 300 : W === H ? 420 : 640);
          return {
            text: `contact sheet: ${labels.join("; ")} (left to right, top to bottom)${r.warnings.length ? `\nQA:\n- ${r.warnings.join("\n- ")}` : "\nQA: no warnings"}`,
            images: [{ label: `contact sheet: ${labels.join("; ")}`, url }],
          };
        } catch (err) {
          return { text: `The scene crashed while rendering: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    },
    {
      name: "look_up_page",
      description: "Read a public web page (the product's site, a tool's homepage): its title, a text excerpt and the images on it (logos, icons) with their addresses, to fetch with fetch_image.",
      parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
      run: async (a) => {
        const res = await fetch("/api/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: String(a.url ?? "") }), signal });
        const body = (await res.json().catch(() => null)) as { site?: SiteInfo; error?: string } | null;
        if (!res.ok || !body?.site) return { text: `Could not read it: ${body?.error ?? res.status}` };
        const p = body.site;
        return {
          text: [
            `${p.url}: "${p.title}". ${p.description}`,
            `Text: ${(p.text ?? "").slice(0, 1500)}`,
            `Images:\n${(p.images ?? []).map((i) => `- ${i.src}${i.alt ? ` (${i.alt})` : ""}`).join("\n") || "(none)"}`,
          ].join("\n"),
        };
      },
    },
    {
      name: "fetch_image",
      description:
        "Fetch a real image (a logo, a product or provider icon) from its address and save it as an asset of this film under `name`. Draw it with <Asset name=... width height />. Use the official image from the brand's own site; never draw a brand's logo from memory. You will see the image to confirm it is the right one.",
      parameters: { type: "object", properties: { url: { type: "string" }, name: { type: "string", description: "a short id, e.g. cursor-logo" } }, required: ["url", "name"] },
      run: async (a) => {
        const name = String(a.name ?? "")
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40);
        if (!name) return { text: "Give the asset a name, e.g. cursor-logo." };
        const assets = (ws.spec.assets ??= {});
        if (!assets[name] && Object.keys(assets).length >= MAX_ASSETS) return { text: `This film already has ${MAX_ASSETS} assets: reuse one, or keep to the ones that matter.` };
        const res = await fetch("/api/asset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: String(a.url ?? "") }), signal });
        const body = (await res.json().catch(() => null)) as { data?: string; type?: string; error?: string } | null;
        if (!res.ok || !body?.data) return { text: `Could not fetch it: ${body?.error ?? res.status}` };
        try {
          const ready = await prepareAsset(body.data);
          const total = Object.entries(assets).reduce((n, [k, v]) => n + (k === name ? 0 : v.length), 0) + ready.data.length;
          if (total > MAX_ASSET_BYTES) return { text: "The film's assets are too heavy together: drop one, or use a smaller image." };
          assets[name] = ready.data;
          ws.dirty = true;
          changed();
          return { text: `saved as asset "${name}" (${ready.width} x ${ready.height}, ${body.type}). Draw it with <Asset name="${name}" width={...} height={...} />.`, images: [{ label: `asset ${name}`, url: ready.preview }] };
        } catch (err) {
          return { text: `That image could not be used: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    },
    {
      name: "finish",
      description: "Call when your part is finished and you have looked at rendered frames of it.",
      parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
      run: async (a) => ({ text: String(a.summary ?? "done"), done: true }),
    },
  ];
}
