"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import type { FilmFormat } from "@/bespoke/film";
import { FilmHost } from "@/bespoke/host";
import type { FilmState } from "@/bespoke/agent/run";
import { FilmComposition, filmFrames } from "@/bespoke/runtime/FilmComposition";
import { FILM_FPS } from "@/bespoke/timing";
import { DIMENSIONS } from "@/engine/plan";
import { wordsAt } from "./frameText";
import type { Transport } from "./Timeline";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).split("\n").slice(0, 8).join("\n");

/**
 * The preview of a bespoke film, showing the last version of the scene
 * that passed the check. The same host renders the agents' stills and the
 * export, so it is handed up to the Studio.
 */
/** The preview's crash, shown in place and reported to the Studio once it is on screen. */
function PreviewError({ text, onError }: { text: string; onError: (message: string) => void }) {
  useEffect(() => onError(text), [text, onError]);
  return <div style={{ color: "#b00", font: "14px/1.4 monospace", padding: 16, whiteSpace: "pre-wrap" }}>{text}</div>;
}

export default function FilmStage({
  film,
  format,
  voiceover,
  music,
  onHost,
  onError,
  transport,
  frameRef,
  picking,
  onPick,
  pin,
}: {
  film: FilmState | null;
  format: FilmFormat;
  voiceover?: Record<number, Blob>;
  music?: Blob;
  onHost: (h: FilmHost | null) => void;
  onError: (message: string) => void;
  transport?: Transport;
  /** The preview's element, for reading the words on the current frame. */
  frameRef?: RefObject<HTMLDivElement | null>;
  /** Picking text: a click on the preview names the words under it instead of playing or pausing. */
  picking?: boolean;
  onPick?: (words: string, at: { x: number; y: number }) => void;
  /** A note pinned to a place on the video: marked there while it is pinned. */
  pin?: { x: number; y: number } | null;
}) {
  const [host] = useState(() => new FilmHost());
  const [input, setInput] = useState(host.current);
  const player = useRef<PlayerRef>(null);

  useEffect(() => {
    onHost(host);
    const off = host.subscribe(setInput);
    // A render (stills for the agents, the export) runs in this page: the preview pauses so it gets the CPU.
    const offRender = host.onRender(() => player.current?.pause());
    return () => {
      off();
      offRender();
      onHost(null);
    };
  }, [host, onHost]);

  const modules = film?.modules ?? null;
  const spec = film?.spec ?? null;
  useEffect(() => {
    if (spec && modules) host.show({ spec, modules, voiceover, music });
  }, [host, spec, modules, voiceover, music]);

  // The timeline follows and moves this player's playhead.
  const mounted = Boolean(input && modules);
  useEffect(() => {
    if (!transport || !mounted) return;
    transport.attach(player.current);
    return () => transport.attach(null);
  }, [transport, mounted]);

  useEffect(() => {
    if (picking) player.current?.pause();
  }, [picking]);

  const pick = (e: MouseEvent<HTMLDivElement>) => {
    if (!picking || !onPick) return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    onPick(wordsAt(e.clientX, e.clientY, e.currentTarget), { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };

  const { width, height } = DIMENSIONS[film?.spec.format ?? format];
  return (
    <div ref={frameRef} className="film-frame" data-picking={picking || undefined} style={{ aspectRatio: `${width} / ${height}` }} onClickCapture={pick} onPointerDownCapture={(e) => picking && e.stopPropagation()}>
      {input && modules ? (
        <Player
          ref={player}
          component={FilmComposition}
          inputProps={input}
          durationInFrames={filmFrames(input)}
          fps={FILM_FPS}
          compositionWidth={DIMENSIONS[input.spec.format].width}
          compositionHeight={DIMENSIONS[input.spec.format].height}
          controls
          loop
          autoPlay
          clickToPlay
          acknowledgeRemotionLicense
          errorFallback={({ error }) => <PreviewError text={message(error)} onError={onError} />}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      ) : (
        <div className="film-wait">{film ? "The scene appears here as soon as its first version passes the check." : "Writing the concept…"}</div>
      )}
      {pin ? <span className="film-pin" style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }} aria-hidden="true" /> : null}
    </div>
  );
}
