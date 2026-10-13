"use client";

import { useEffect, useRef } from "react";
import type { FilmFormat } from "@/bespoke/film";
import { SANDBOX_FLAGS, SANDBOX_SRC, Sandbox } from "@/bespoke/host";
import { DIMENSIONS } from "@/engine/plan";
import type { FilmState } from "@/bespoke/agent/run";

/**
 * The preview of a bespoke film: the sandbox iframe, showing the last
 * version of the scene that passed the check. The same sandbox renders the
 * agent's stills and the export, so it is handed up to the Studio.
 */
export function FilmStage({ film, format, onSandbox, onError }: { film: FilmState | null; format: FilmFormat; onSandbox: (s: Sandbox | null) => void; onError: (message: string) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<Sandbox | null>(null);

  useEffect(() => {
    if (!frame.current) return;
    const sb = new Sandbox(frame.current);
    box.current = sb;
    onSandbox(sb);
    return () => {
      sb.dispose();
      box.current = null;
      onSandbox(null);
    };
  }, [onSandbox]);

  useEffect(() => {
    if (box.current) box.current.onError = onError;
  }, [onError]);

  const modules = film?.modules ?? null;
  const spec = film?.spec ?? null;
  useEffect(() => {
    if (box.current && spec && modules) box.current.show({ spec, modules });
  }, [spec, modules]);

  return (
    <div className="film-frame" style={{ aspectRatio: `${DIMENSIONS[film?.spec.format ?? format].width} / ${DIMENSIONS[film?.spec.format ?? format].height}` }}>
      <iframe ref={frame} title="Video preview" src={SANDBOX_SRC} sandbox={SANDBOX_FLAGS} />
      {!modules ? <div className="film-wait">{film ? "The scene appears here as soon as its first version passes the check." : "Writing the concept…"}</div> : null}
    </div>
  );
}
