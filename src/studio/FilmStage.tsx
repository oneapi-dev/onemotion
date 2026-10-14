"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useRef, useState } from "react";
import type { FilmFormat } from "@/bespoke/film";
import { FilmHost } from "@/bespoke/host";
import type { FilmState } from "@/bespoke/agent/run";
import { FilmComposition, filmFrames } from "@/bespoke/runtime/FilmComposition";
import { FILM_FPS } from "@/bespoke/timing";
import { DIMENSIONS } from "@/engine/plan";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).split("\n").slice(0, 8).join("\n");

/**
 * The preview of a bespoke film, showing the last version of the scene
 * that passed the check. The same host renders the agents' stills and the
 * export, so it is handed up to the Studio.
 */
export default function FilmStage({ film, format, voiceover, music, onHost, onError }: { film: FilmState | null; format: FilmFormat; voiceover?: Record<number, Blob>; music?: Blob; onHost: (h: FilmHost | null) => void; onError: (message: string) => void }) {
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

  const { width, height } = DIMENSIONS[film?.spec.format ?? format];
  return (
    <div className="film-frame" style={{ aspectRatio: `${width} / ${height}` }}>
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
          errorFallback={({ error }) => {
            onError(message(error));
            return <div style={{ color: "#b00", font: "14px/1.4 monospace", padding: 16, whiteSpace: "pre-wrap" }}>{message(error)}</div>;
          }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      ) : (
        <div className="film-wait">{film ? "The scene appears here as soon as its first version passes the check." : "Writing the concept…"}</div>
      )}
    </div>
  );
}
