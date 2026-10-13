import "./shim";
import { Player } from "@remotion/player";
import { renderMediaOnWeb, renderStillOnWeb } from "@remotion/web-renderer";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DIMENSIONS } from "../../engine/plan";
import type { FilmInput } from "../film";
import { FILM_FPS } from "../timing";
import { FilmComposition, filmFrames } from "./FilmComposition";
import type { FromSandbox, ToSandbox, WireFilm } from "./protocol";
import { qaWarnings } from "./qa";

/**
 * The sandbox: runs a scene the model wrote, away from the Studio. This page
 * has an opaque origin (no storage, no cookies, no access to the Studio) and
 * a CSP that only lets it load this app's static files and Google Fonts. It
 * shows the Player, renders stills for the model to look at, and exports
 * the MP4, and talks to the Studio only by postMessage.
 */

const post = (msg: FromSandbox) => window.parent.postMessage(msg, "*");

const voiceUrls = new Map<Blob, string>();
/** Voice blobs become URLs of this origin, made once per blob. */
function toInput(film: WireFilm): FilmInput {
  const voiceover: Record<number, string> = {};
  for (const [i, blob] of Object.entries(film.voiceover ?? {})) {
    let url = voiceUrls.get(blob);
    if (!url) {
      url = URL.createObjectURL(blob);
      voiceUrls.set(blob, url);
    }
    voiceover[Number(i)] = url;
  }
  return { spec: film.spec, modules: film.modules, voiceover };
}

const composition = (input: FilmInput) => {
  const { width, height } = DIMENSIONS[input.spec.format];
  return { id: "film", component: FilmComposition, width, height, fps: FILM_FPS, durationInFrames: filmFrames(input), defaultProps: input };
};

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).split("\n").slice(0, 8).join("\n");

const jobs = new Map<string, AbortController>();

async function stills(id: string, film: WireFilm, frames: number[], quality: number) {
  const input = { ...toInput(film), qa: true };
  const comp = composition(input);
  qaWarnings.length = 0;
  const images: Blob[] = [];
  const ctrl = new AbortController();
  jobs.set(id, ctrl);
  try {
    for (const frame of frames) {
      const f = Math.max(0, Math.min(comp.durationInFrames - 1, Math.round(frame)));
      const still = await renderStillOnWeb({ composition: comp, inputProps: input, frame: f, signal: ctrl.signal, delayRenderTimeoutInMilliseconds: 120_000 });
      images.push(await still.blob({ format: "jpeg", quality }));
    }
    post({ type: "stills", id, images, warnings: [...new Set(qaWarnings)].slice(0, 30) });
  } catch (err) {
    post({ type: "failed", id, message: message(err) });
  } finally {
    jobs.delete(id);
  }
}

async function exportFilm(id: string, film: WireFilm) {
  const input = toInput(film);
  const ctrl = new AbortController();
  jobs.set(id, ctrl);
  try {
    const result = await renderMediaOnWeb({
      composition: composition(input),
      inputProps: input,
      container: "mp4",
      videoCodec: "h264",
      videoBitrate: "high",
      signal: ctrl.signal,
      onProgress: (p) => post({ type: "progress", id, progress: p.progress }),
    });
    post({ type: "exported", id, blob: await result.getBlob() });
  } catch (err) {
    post({ type: "failed", id, message: message(err) });
  } finally {
    jobs.delete(id);
  }
}

function App() {
  const [input, setInput] = useState<FilmInput | null>(null);
  useEffect(() => {
    const on = (e: MessageEvent<ToSandbox>) => {
      if (e.source !== window.parent || !e.data || typeof e.data !== "object") return;
      const m = e.data;
      if (m.type === "ping") post({ type: "ready" });
      else if (m.type === "show") {
        try {
          const next = toInput(m.film);
          setInput(next);
          post({ type: "shown", frames: filmFrames(next) });
        } catch (err) {
          post({ type: "player-error", message: message(err) });
        }
      } else if (m.type === "stills") void stills(m.id, m.film, m.frames, m.quality ?? 0.82);
      else if (m.type === "export") void exportFilm(m.id, m.film);
      else if (m.type === "abort") jobs.get(m.id)?.abort();
    };
    window.addEventListener("message", on);
    post({ type: "ready" });
    return () => window.removeEventListener("message", on);
  }, []);
  if (!input) return null;
  const { width, height } = DIMENSIONS[input.spec.format];
  return (
    <Player
      component={FilmComposition}
      inputProps={input}
      durationInFrames={filmFrames(input)}
      fps={FILM_FPS}
      compositionWidth={width}
      compositionHeight={height}
      controls
      loop
      autoPlay
      clickToPlay
      acknowledgeRemotionLicense
      errorFallback={({ error }) => {
        post({ type: "player-error", message: message(error) });
        return <div style={{ color: "#b00", font: "14px/1.4 monospace", padding: 16, whiteSpace: "pre-wrap" }}>{message(error)}</div>;
      }}
      style={{ width: "100%", height: "100%" }}
    />
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
