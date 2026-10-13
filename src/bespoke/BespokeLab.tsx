"use client";

import { useEffect, useRef, useState } from "react";
import { DIMENSIONS } from "@/engine/plan";
import { normalizeScore } from "@/music/score";
import type { FilmSpec } from "./film";
import { SANDBOX_FLAGS, SANDBOX_SRC, Sandbox } from "./host";
import type { WireFilm } from "./runtime/protocol";
import { filmTiming, type FilmBeat } from "./timing";

type Example = { name: string; film: { format: FilmSpec["format"]; brand: FilmSpec["brand"]; score: unknown; beats: FilmBeat[] }; files: Record<string, string> };

/**
 * The bespoke lab: runs a hand-written example scene through the same path a
 * model's scene takes (check and compile, the sandbox, stills, export), to
 * prove the pipeline without a model.
 */
export default function BespokeLab() {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<Sandbox | null>(null);
  const [film, setFilm] = useState<WireFilm | null>(null);
  const [status, setStatus] = useState("Checking the example…");
  const [errors, setErrors] = useState<string[]>([]);
  const [stills, setStills] = useState<{ frame: number; url: string }[]>([]);
  const [video, setVideo] = useState<{ url: string; mb: number; seconds: number } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!frame.current) return;
    const sb = new Sandbox(frame.current);
    sb.onError = (m) => setErrors((e) => [...e, `player: ${m}`]);
    box.current = sb;
    let live = true;
    (async () => {
      const name = new URLSearchParams(window.location.search).get("example") ?? "gateway";
      const ex = (await (await fetch(`/api/scene/example?name=${encodeURIComponent(name)}`)).json()) as Example;
      const t0 = performance.now();
      const checked = (await (await fetch("/api/scene/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: ex.files }) })).json()) as { ok: boolean; errors: string[]; modules: Record<string, string> };
      if (!live) return;
      if (!checked.ok) {
        setErrors(checked.errors);
        setStatus("The example did not pass the check.");
        return;
      }
      const score = normalizeScore(ex.film.score, ex.film.beats.length, "house", 7);
      // ?captions=1 times every line as if it had been recorded (0.38 s a word), to check captions without a voice key.
      const fake = new URLSearchParams(window.location.search).get("captions") === "1";
      const beats = fake
        ? ex.film.beats.map((b) => ({ ...b, words: (b.voice ?? "").split(" ").filter(Boolean).map((text, i) => ({ text, start: i * 0.38, end: i * 0.38 + 0.32 })) }))
        : ex.film.beats;
      const spec: FilmSpec = { format: ex.film.format, brand: ex.film.brand, beats, score };
      const wire = { spec, modules: checked.modules };
      setFilm(wire);
      sb.show(wire);
      setStatus(`Checked in ${Math.round(performance.now() - t0)} ms. ${filmTiming(spec.beats, score).timing.total} frames.`);
    })().catch((e: unknown) => setStatus(`Failed: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      live = false;
      sb.dispose();
    };
  }, []);

  const renderStills = async () => {
    if (!film || !box.current) return;
    const { beats } = filmTiming(film.spec.beats, film.spec.score);
    const frames = beats.flatMap((b) => [Math.round(b.start + (b.end - b.start) * 0.3), Math.round(b.start + (b.end - b.start) * 0.8)]);
    setStatus("Rendering stills…");
    const t0 = performance.now();
    try {
      const r = await box.current.stills(film, frames);
      setStills(r.images.map((b, i) => ({ frame: frames[i], url: URL.createObjectURL(b) })));
      setErrors(r.warnings.map((w) => `qa: ${w}`));
      setStatus(`${frames.length} stills in ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
    } catch (e) {
      setErrors((x) => [...x, `stills: ${e instanceof Error ? e.message : String(e)}`]);
      setStatus("Stills failed.");
    }
  };

  const exportVideo = async () => {
    if (!film || !box.current) return;
    setStatus("Exporting…");
    const t0 = performance.now();
    try {
      const blob = await box.current.exportMp4(film, setProgress);
      setVideo({ url: URL.createObjectURL(blob), mb: blob.size / 1e6, seconds: (performance.now() - t0) / 1000 });
      setStatus("Exported.");
    } catch (e) {
      setErrors((x) => [...x, `export: ${e instanceof Error ? e.message : String(e)}`]);
      setStatus("Export failed.");
    } finally {
      setProgress(null);
    }
  };

  const { width, height } = DIMENSIONS[film?.spec.format ?? "landscape"];
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", color: "#eee" }}>
      <h1 style={{ fontSize: 22 }}>Bespoke lab</h1>
      <p data-testid="status">{status}</p>
      <iframe ref={frame} title="Bespoke preview" src={SANDBOX_SRC} sandbox={SANDBOX_FLAGS} style={{ width: "100%", aspectRatio: `${width} / ${height}`, border: 0, background: "#000", display: "block" }} />
      <div style={{ display: "flex", gap: 12, margin: "16px 0" }}>
        <button type="button" onClick={renderStills} disabled={!film}>
          Render stills
        </button>
        <button type="button" onClick={exportVideo} disabled={!film || progress !== null}>
          {progress !== null ? `Exporting ${Math.round(progress * 100)}%` : "Export MP4"}
        </button>
      </div>
      {errors.length ? <pre data-testid="errors" style={{ color: "#ff8a8a", whiteSpace: "pre-wrap" }}>{errors.join("\n")}</pre> : null}
      {video ? (
        <p data-testid="video">
          <a href={video.url} download="bespoke-gateway.mp4" style={{ color: "#9cf" }}>
            Download MP4
          </a>{" "}
          {video.mb.toFixed(1)} MB in {video.seconds.toFixed(0)} s
        </p>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        {stills.map((s) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={s.frame} src={s.url} alt={`frame ${s.frame}`} style={{ width: "100%" }} />
        ))}
      </div>
    </main>
  );
}
