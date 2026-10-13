"use client";

import type { FilmSpec } from "../film";
import type { Sandbox } from "../host";
import { filmTiming } from "../timing";
import type { Concept } from "./concept";
import { scaled } from "./images";
import { chatStep, parseJson, type Part, type Usage } from "./llm";

export type Issue = { tile?: string; severity: "high" | "med" | "low"; problem: string; fix: string };
export type Review = { score: number; pass: boolean; summary: string; issues: Issue[] };

type Tile = { id: string; frame: number; label: string };

/** The moments a reviewer needs: the thumbnail, every beat settled, every change between beats, the close. */
export function reviewTiles(spec: FilmSpec): Tile[] {
  const { timing, beats } = filmTiming(spec.beats, spec.score);
  const tiles: Omit<Tile, "id">[] = [{ frame: 4, label: "first frame (the thumbnail)" }];
  beats.forEach((b, i) => {
    tiles.push({ frame: Math.round(b.start + (b.end - b.start) * 0.65), label: `hold during ${b.id}: "${b.says}"` });
    if (i < beats.length - 1) tiles.push({ frame: Math.min(timing.total - 1, b.end + 4), label: `transition ${b.id} to ${beats[i + 1].id}` });
  });
  tiles.push({ frame: timing.total - 20, label: "final hold (the close)" });
  return tiles.map((t, i) => ({ ...t, id: `T${i + 1}` }));
}

function normalizeReview(raw: unknown): Review {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const issues = (Array.isArray(r.issues) ? r.issues : [])
    .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object")
    .map((i): Issue => ({
      tile: typeof i.tile === "string" ? i.tile : undefined,
      severity: i.severity === "high" || i.severity === "low" ? i.severity : "med",
      problem: String(i.problem ?? "").slice(0, 400),
      fix: String(i.fix ?? "").slice(0, 600),
    }))
    .filter((i) => i.problem)
    .slice(0, 8);
  const score = typeof r.score === "number" && Number.isFinite(r.score) ? Math.max(0, Math.min(10, r.score)) : 0;
  return { score, pass: r.pass === true && score >= 8 && !issues.some((i) => i.severity === "high"), summary: String(r.summary ?? "").slice(0, 300), issues };
}

/**
 * A fresh look at the film: labelled frames, the facts, the concept and the
 * automated QA go to the model as an art director, which returns a score and
 * concrete fixes.
 */
export async function reviewFilm(o: {
  key: string;
  model: string;
  system: string;
  spec: FilmSpec;
  modules: Record<string, string>;
  concept: Concept;
  facts: string;
  sandbox: Sandbox;
  signal?: AbortSignal;
}): Promise<{ review: Review; usage: Usage; warnings: string[] }> {
  const tiles = reviewTiles(o.spec);
  const { images, warnings } = await o.sandbox.stills({ spec: o.spec, modules: o.modules }, tiles.map((t) => t.frame), o.signal);
  const portrait = o.spec.format === "portrait";
  const urls = await Promise.all(images.map((b) => scaled(b, portrait ? 720 : 1280)));
  const parts: Part[] = [
    {
      type: "text",
      text: [
        `FACTS:\n${o.facts}`,
        `CONCEPT:\n${JSON.stringify({ title: o.concept.title, angle: o.concept.angle, style: o.concept.style, metaphor: o.concept.metaphor, world: o.concept.world, camera: o.concept.camera, palette: o.concept.palette })}`,
        `BEATS:\n${o.spec.beats.map((b) => `${b.id}: says "${b.says}"; shows ${b.shows}`).join("\n")}`,
        `AUTOMATED QA WARNINGS:\n${warnings.length ? warnings.map((w) => `- ${w}`).join("\n") : "(none)"}`,
        `TILES:\n${tiles.map((t) => `${t.id}: frame ${t.frame}, ${t.label}`).join("\n")}`,
      ].join("\n\n"),
    },
    ...tiles.flatMap((t, i): Part[] => [
      { type: "text", text: `${t.id}: frame ${t.frame}, ${t.label}` },
      { type: "image_url", image_url: { url: urls[i] } },
    ]),
  ];
  const r = await chatStep({ key: o.key, model: o.model, messages: [{ role: "system", content: o.system }, { role: "user", content: parts }], temperature: 0.2, maxTokens: 6000, json: true, signal: o.signal });
  return { review: normalizeReview(parseJson(r.text)), usage: r.usage, warnings };
}
