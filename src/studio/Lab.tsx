"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Plan, VideoInput } from "@/engine/plan";
import { SAMPLE_INPUT } from "@/engine/sample";
import { playable, specOf } from "@/music/genres";
import { GENRES, normalizeScore, presetScore, type Energy, type Genre, type MomentKind, type Score } from "@/music/score";
import { PITCH_CLASSES, type Mode, type PitchClass } from "@/music/theory";

const Preview = dynamic(() => import("./Preview"), {
  ssr: false,
  loading: () => <div className="preview-wait" aria-hidden="true" />,
});

/**
 * The music lab: one video, its score laid open. Pick a genre, key, tempo,
 * an energy and a moment per scene, and hear the result against the picture.
 * For judging genres by ear and tuning them; the director writes the same
 * score for real videos.
 */

const LONG: Plan = {
  ...SAMPLE_INPUT.plan,
  angle: "One API key for every model, set up in minutes.",
  scenes: [
    { type: "hook", duration: 2.6, title: "Every model. One key." },
    {
      type: "kinetic",
      duration: 3,
      items: [{ title: "GPT" }, { title: "Claude" }, { title: "Gemini" }, { title: "One key" }],
    },
    { type: "stat", duration: 3.4, value: "200+", title: "models on one key" },
    {
      type: "specs",
      duration: 4,
      title: "Price per 1M tokens",
      items: [
        { title: "Input", body: "$0.07" },
        { title: "Output", body: "$0.14" },
        { title: "Context", body: "1M" },
      ],
    },
    {
      type: "checklist",
      duration: 3.5,
      title: "What you skip",
      items: [{ title: "Five accounts" }, { title: "Five bills" }, { title: "Five SDKs" }],
    },
    { type: "statement", duration: 3, title: "Same models. Smaller bill." },
    { type: "cta", duration: 3.2, title: "Get your key", body: "oneapi.id" },
  ],
};
const PLANS: Record<"short" | "long", Plan> = {
  short: SAMPLE_INPUT.plan,
  long: LONG,
};
const MOMENTS: (MomentKind | "")[] = ["", "drop", "stop", "riser"];

export function Lab() {
  const [which, setWhich] = useState<"short" | "long">("long");
  const plan = PLANS[which];
  const n = plan.scenes.length;
  const [score, setScore] = useState<Score>(() => presetScore("house", LONG.scenes.length, 1));
  const [copied, setCopied] = useState(false);

  const fresh = (genre: Genre, seed: number, scenes = n) => setScore(presetScore(genre, scenes, seed));
  const set = (patch: Partial<Score>) => setScore((s) => ({ ...s, ...patch }));
  const spec = specOf(score.genre);
  const input: VideoInput = useMemo(() => ({ ...SAMPLE_INPUT, plan: { ...plan, score } }), [plan, score]);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="wordmark">Music lab</span>
          <span className="by">Motion by OneAPI</span>
        </div>
        <Link className="btn ghost small" href="/">
          Back to the studio
        </Link>
      </header>
      <main className="studio">
        <section className="compose">
          <div className="stack">
            <div className="field">
              <span>Video</span>
              <div className="seg" role="radiogroup" style={{ alignSelf: "flex-start" }}>
                {(["short", "long"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={which === k}
                    onClick={() => {
                      setWhich(k);
                      fresh(score.genre, score.seed, PLANS[k].scenes.length);
                    }}
                  >
                    {k === "short" ? `Short (${PLANS.short.scenes.length} scenes)` : `Long (${PLANS.long.scenes.length} scenes)`}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>
                Genre
                {playable(score.genre) !== score.genre ? <em>not written yet, plays as {playable(score.genre)}</em> : null}
              </span>
              <select value={score.genre} onChange={(e) => fresh(e.target.value as Genre, score.seed)}>
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                    {playable(g) !== g ? ` (as ${playable(g)})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <label className="field">
                <span>Key</span>
                <select value={score.key} onChange={(e) => set({ key: e.target.value as PitchClass })}>
                  {PITCH_CLASSES.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Mode</span>
                {/* A new mode takes that mode's progressions; chords of the old one would not fit. */}
                <select value={score.mode} onChange={(e) => setScore(normalizeScore({ ...score, mode: e.target.value as Mode, chords: [] }, n, score.genre, score.seed))}>
                  <option value="minor">minor</option>
                  <option value="major">major</option>
                </select>
              </label>
              <label className="field">
                <span>
                  Tempo<em>{score.bpm} bpm</em>
                </span>
                <input type="range" min={spec.bpm[0]} max={spec.bpm[1]} value={score.bpm} onChange={(e) => set({ bpm: Number(e.target.value) })} />
              </label>
            </div>
            <div className="row">
              <label className="field">
                <span>Seed</span>
                <input type="number" value={score.seed} onChange={(e) => fresh(score.genre, Math.max(0, Math.round(Number(e.target.value) || 0)))} />
              </label>
              <button type="button" className="btn" onClick={() => fresh(score.genre, Math.floor(Math.random() * 1e6))}>
                Another take
              </button>
            </div>
          </div>

          <div className="stack">
            <div className="field">
              <span>Scenes</span>
            </div>
            {plan.scenes.map((scene, i) => (
              <div key={i} className="row wrap">
                <span className="inline" style={{ minWidth: 92 }} title={score.chords[i]?.join(" ")}>
                  {i + 1}. {scene.type}
                </span>
                <div className="seg" role="radiogroup" aria-label={`Energy of scene ${i + 1}`}>
                  {([0, 1, 2, 3] as Energy[]).map((e) => (
                    <button
                      key={e}
                      type="button"
                      role="radio"
                      aria-checked={score.energy[i] === e}
                      onClick={() =>
                        set({
                          energy: score.energy.map((x, j) => (j === i ? e : x)),
                        })
                      }
                    >
                      {e}
                    </button>
                  ))}
                </div>
                {i > 0 ? (
                  <span className="inline">
                    <select
                      aria-label={`Moment of scene ${i + 1}`}
                      value={score.moments.find((m) => m.scene === i)?.kind ?? ""}
                      onChange={(e) => {
                        const kind = e.target.value as MomentKind | "";
                        const rest = score.moments.filter((m) => m.scene !== i);
                        set({
                          moments: kind ? [...rest, { scene: i, kind }].slice(-3) : rest,
                        });
                      }}
                    >
                      {MOMENTS.map((m) => (
                        <option key={m} value={m}>
                          {m || "no moment"}
                        </option>
                      ))}
                    </select>
                  </span>
                ) : null}
              </div>
            ))}
            <p className="hint">Energy 0 is pad only, 1 adds bass and hats, 2 the full drums, 3 the lead or brass. Up to three moments.</p>
          </div>

          <div className="row wrap">
            <button
              type="button"
              className="btn ghost small"
              onClick={() => {
                void navigator.clipboard.writeText(JSON.stringify(score, null, 2));
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy score JSON"}
            </button>
          </div>
        </section>
        <section className="stage">
          <div className="frame">
            <Preview input={input} />
          </div>
        </section>
      </main>
    </div>
  );
}
