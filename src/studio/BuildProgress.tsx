"use client";

import type { AgentEvent } from "@/bespoke/agent/loop";

/**
 * Where a bespoke build is: its steps (done, now, to come), a bar that moves
 * with them, and the last things the AI did. Steps, not a percentage: how
 * long each one takes cannot be known in advance, and a bar that pretends
 * otherwise lies.
 */

export type StepState = "done" | "now" | "next";
export type BuildStep = { id: string; label: string; state: StepState };

/** The build's steps from what is known: the studio's stage, whether the concept exists, and the film's log. */
export function buildSteps(o: { stage: "site" | "film" | null; hasFilm: boolean; log: { text: string }[]; finished: boolean }): BuildStep[] {
  const has = (re: RegExp) => o.log.some((e) => re.test(e.text));
  const rounds = o.log.filter((e) => /^\[review\] round \d/.test(e.text)).length;
  const lastFix = has(/measured defects? the QA still found/);
  const ids = ["site", "concept", "scene", "review", "final"] as const;
  const labels: Record<(typeof ids)[number], string> = {
    site: "Read the website",
    concept: "Concept",
    scene: "Write the scene",
    review: rounds ? `Art director review (round ${Math.min(rounds, 2)} of 2)` : "Art director review",
    final: "Final QA fixes",
  };
  const now: (typeof ids)[number] | null = o.finished ? null : o.stage === "site" ? "site" : !o.hasFilm ? "concept" : lastFix ? "final" : rounds ? "review" : "scene";
  const at = now ? ids.indexOf(now) : ids.length;
  return ids.map((id, i) => ({ id, label: labels[id], state: i < at ? "done" : i === at ? "now" : "next" }));
}

/** The bar: done steps, and half of the one in progress. */
export const progressOf = (steps: BuildStep[]) => (steps.filter((s) => s.state === "done").length + (steps.some((s) => s.state === "now") ? 0.5 : 0)) / steps.length;

/** A log line as the person reads it: without the agent's tag, and the tool's long output cut short. */
const lineOf = (e: AgentEvent) => e.text.replace(/^\[(lead|review|b\d+)\]\s*/, "").replace(/\s+/g, " ").slice(0, 140);

export function BuildProgress({ stage, hasFilm, log, seconds, finished, onShowLog }: { stage: "site" | "film" | null; hasFilm: boolean; log: AgentEvent[]; seconds: number; finished: boolean; onShowLog?: () => void }) {
  const steps = buildSteps({ stage, hasFilm, log, finished });
  const p = progressOf(steps);
  const recent = log.slice(-6).reverse();
  return (
    <section className="build" aria-label="Build progress">
      <div className="build-head">
        <strong>{steps.find((s) => s.state === "now")?.label ?? "Done"}</strong>
        <span className="mono hint">{seconds}s</span>
      </div>
      <div className="build-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-valuetext={`${steps.filter((s) => s.state === "done").length} of ${steps.length} steps done`}>
        <span style={{ width: `${Math.round(p * 100)}%` }} />
      </div>
      <ol className="build-steps">
        {steps.map((s) => (
          <li key={s.id} data-state={s.state}>
            <span className="build-mark" aria-hidden="true">
              {s.state === "done" ? "✓" : ""}
            </span>
            {s.label}
          </li>
        ))}
      </ol>
      {recent.length ? (
        <ol className="build-log" aria-label="What the AI did last">
          {recent.map((e, i) => (
            <li key={log.length - i} className={`log-${e.kind}`}>
              {lineOf(e)}
            </li>
          ))}
        </ol>
      ) : null}
      {onShowLog && log.length > 6 ? (
        <button type="button" className="link" onClick={onShowLog}>
          Show the full log ({log.length})
        </button>
      ) : null}
    </section>
  );
}
