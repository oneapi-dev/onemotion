"use client";

import type { PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useState } from "react";
import type { FilmSpec } from "@/bespoke/film";
import { FILM_FPS, filmTiming } from "@/bespoke/timing";

/**
 * The preview's playhead, shared without re-rendering the Studio on every
 * frame: the stage attaches its player, the timeline listens and seeks.
 */
export type Transport = {
  attach: (p: PlayerRef | null) => void;
  seek: (frame: number) => void;
  pause: () => void;
  subscribe: (fn: (frame: number) => void) => () => void;
};

export function createTransport(): Transport {
  let player: PlayerRef | null = null;
  let frame = 0;
  const subs = new Set<(f: number) => void>();
  const onFrame = (e: { detail: { frame: number } }) => {
    frame = e.detail.frame;
    subs.forEach((fn) => fn(frame));
  };
  return {
    attach(p) {
      player?.removeEventListener("frameupdate", onFrame);
      player = p;
      player?.addEventListener("frameupdate", onFrame);
    },
    pause() {
      player?.pause();
    },
    seek(f) {
      player?.seekTo(f);
      frame = f;
      subs.forEach((fn) => fn(f));
    },
    subscribe(fn) {
      subs.add(fn);
      fn(frame);
      return () => subs.delete(fn);
    },
  };
}

/** A frame as a timecode: seconds and frames, "00:04.12". */
export const timecode = (f: number) => {
  const s = Math.floor(f / FILM_FPS);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.${String(Math.max(0, Math.round(f % FILM_FPS))).padStart(2, "0")}`;
};

/**
 * The film's beats on a line, each as wide as it lasts, with where its
 * voice line is spoken under it and the playhead over all. Clicking a beat
 * plays from it; shift-click (or the checkbox) picks beats for the next
 * note to the AI editor.
 */
export function Timeline({ spec, transport, selected, onSelect }: { spec: FilmSpec; transport: Transport; selected: string[]; onSelect: (ids: string[]) => void }) {
  const { timing, beats } = useMemo(() => filmTiming(spec.beats, spec.score), [spec.beats, spec.score]);
  const [frame, setFrame] = useState(0);
  useEffect(() => transport.subscribe(setFrame), [transport]);
  const total = Math.max(1, timing.total);
  const pct = (f: number) => `${(Math.min(total, Math.max(0, f)) / total) * 100}%`;
  const seconds = total / FILM_FPS;
  const step = seconds > 60 ? 10 : seconds > 24 ? 5 : seconds > 10 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(seconds / step) + 1 }, (_, i) => i * step);
  const toggle = (id: string) => onSelect(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="timeline" aria-label="Scenes on the timeline">
      <div className="timeline-head">
        <span className="timecode" aria-live="off">
          {timecode(frame)} <span className="timecode-total">/ {timecode(total)}</span>
        </span>
        <span className="timeline-hint">{selected.length ? `${selected.length} scene${selected.length === 1 ? "" : "s"} selected for Improve` : "Click a scene to play it · shift-click to select it for Improve"}</span>
        {selected.length ? (
          <button type="button" className="btn ghost small" onClick={() => onSelect([])}>
            Clear selection
          </button>
        ) : null}
      </div>
      <div className="timeline-body">
        <div className="ruler" aria-hidden="true">
          {ticks.map((s) => (
            <span key={s} style={{ left: pct(s * FILM_FPS) }}>
              {s}s
            </span>
          ))}
        </div>
        <ol className="beats">
          {beats.map((b, i) => {
            const isOn = selected.includes(b.id);
            const playing = frame >= b.start && frame < b.end;
            return (
              <li key={b.id} className="beat" style={{ left: pct(b.start), width: `calc(${pct(b.end - b.start)} - 2px)` }} data-playing={playing || undefined} data-selected={isOn || undefined}>
                <button
                  type="button"
                  className="beat-body"
                  aria-pressed={isOn}
                  title={`${b.id}: ${b.says}\n${spec.beats[i]?.shows ?? ""}`}
                  onClick={(e) => (e.shiftKey || e.metaKey || e.ctrlKey ? toggle(b.id) : transport.seek(b.start))}
                >
                  <span className="beat-id">{b.id}</span>
                  <span className="beat-says">{b.says || "…"}</span>
                </button>
                {b.words.length && b.voice ? (
                  <span
                    className={`voice-bar${b.spoken ? "" : " estimated"}`}
                    style={{ left: `${((b.words[0].at - b.start) / (b.end - b.start)) * 100}%`, width: `${((b.words[b.words.length - 1].end - b.words[0].at) / (b.end - b.start)) * 100}%` }}
                    title={b.spoken ? `Voice: ${b.voice}` : `Voice (not recorded, timed by estimate): ${b.voice}`}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
        <div className="playhead" style={{ left: pct(frame) }} aria-hidden="true" />
      </div>
    </div>
  );
}
