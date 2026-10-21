import { Audio } from "@remotion/media";
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as JSXRuntime from "react/jsx-runtime";
import { flushSync } from "react-dom";
import * as Remotion from "remotion";
import { AbsoluteFill, Sequence, staticFile, useDelayRender } from "remotion";
import { DIMENSIONS } from "../../engine/plan";
import { LIBRARY } from "../../music/library";
import { composeTrack } from "../../music/render";
import { hashOf } from "../../music/rng";
import { useTrack } from "../../music/useTrack";
import type { FilmInput } from "../film";
import * as Kit from "../kit";
import { FilmProvider, makeCue, type Film } from "../kit/film";
import { loadFonts } from "../kit/fonts";
import { FILM_FPS, VOICE_LEAD, filmTiming } from "../timing";
import { Captions } from "./Captions";
import { loadScene } from "./modules";
import { QaProbe } from "./qa";

/** A module namespace as CommonJS code expects it (transpiled `import x from` reads `.default`). */
const cjs = (ns: object) => Object.assign({ __esModule: true }, ns, { default: (ns as { default?: unknown }).default ?? ns });
const EXTERNALS = { react: cjs(React), "react/jsx-runtime": cjs(JSXRuntime), remotion: cjs(Remotion), "@kit": cjs(Kit) };

import { defaultLevel, DUCK, DUCK_FRAMES } from "../../music/mix";
import { musicStart } from "../../music/analyze";

export const filmFrames = (input: FilmInput) => filmTiming(input.spec.beats, input.spec.score).timing.total;

/** Where in a track the film starts (seconds): its close on a drop when one fits, else the first downbeat. */
const startOf = (downbeat: number, drops: number[], seconds: number, t: ReturnType<typeof filmTiming>["timing"]) => musicStart({ downbeat, drops, seconds }, t.closeAt / FILM_FPS, t.total / FILM_FPS).start;

/**
 * A bespoke film: the scene the model wrote, given its clock (useFilm), its
 * fonts (loaded before the first frame, since text is measured), the music
 * composed for its beats and the voice-over.
 */
export const FilmComposition: React.FC<FilmInput> = ({ spec, modules, voiceover, music, qa }) => {
  const root = useRef<HTMLDivElement>(null);
  const scene = useMemo(() => loadScene(modules, EXTERNALS), [modules]);
  const { width: W, height: H } = DIMENSIONS[spec.format];
  const { timing, beats } = useMemo(() => filmTiming(spec.beats, spec.score), [spec.beats, spec.score]);
  const film = useMemo<Film>(() => {
    const P = H > W;
    const voiced = beats.some((b) => b.spoken);
    return {
      fps: FILM_FPS,
      W,
      H,
      P,
      format: spec.format,
      total: timing.total,
      beats,
      beat: (id) => (typeof id === "number" ? beats[id] : beats.find((b) => b.id === id)) ?? beats[0],
      cue: makeCue(beats, timing.total, FILM_FPS),
      brand: spec.brand,
      partner: spec.partner ?? null,
      assets: spec.assets ?? {},
      // With a recorded voice, the captions take the bottom band.
      safe: P
        ? { top: Math.round(H * 0.07), bottom: Math.round(H * (voiced ? 0.78 : 0.86)), left: 60, right: W - 60 }
        : { top: 70, bottom: H - (voiced ? 180 : 90), left: 100, right: W - 100 },
    };
  }, [W, H, spec.format, spec.brand, spec.partner, spec.assets, timing.total, beats]);

  const ready = useFonts(scene.fonts ?? {});
  const Scene = scene.default;
  return (
    <AbsoluteFill ref={root} style={{ background: scene.background ?? "#ffffff", overflow: "hidden" }}>
      {ready ? (
        <FilmProvider value={film}>
          <Scene />
        </FilmProvider>
      ) : null}
      {ready && scene.captions !== false ? <Captions beats={beats} W={W} H={H} style={scene.captionStyle} /> : null}
      {ready ? <QaProbe root={root} width={W} on={Boolean(qa)} /> : null}
      <FilmSound input={{ spec, modules, voiceover, music }} timing={timing} />
    </AbsoluteFill>
  );
};

/** Holds rendering until the scene's fonts are loaded. */
function useFonts(req: Record<string, string[]>): boolean {
  const key = JSON.stringify(req);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [state, setState] = useState<{ key: string; ready: boolean }>({ key, ready: false });
  const [handle] = useState(() => delayRender("Loading the scene's fonts"));
  useEffect(() => {
    let live = true;
    loadFonts(JSON.parse(key)).then(
      () => {
        // The frame may be taken only once the scene is mounted with its fonts: the ready render is committed
        // synchronously, then the frame is released (released before, a still is the bare background).
        if (live) flushSync(() => setState({ key, ready: true }));
        continueRender(handle);
      },
      (err: unknown) => cancelRender(err instanceof Error ? err : new Error(String(err))),
    );
    return () => {
      live = false;
    };
  }, [key, handle, continueRender, cancelRender]);
  return state.key === key && state.ready;
}

const FilmSound: React.FC<{ input: FilmInput; timing: ReturnType<typeof filmTiming>["timing"] }> = ({ input, timing: t }) => {
  const { spec, voiceover, music } = input;
  // The person turned the music off: the voice alone.
  if (spec.mix?.off) return <Sound music={null} voiceover={voiceover} spec={spec} timing={t} />;
  // A made bed (ElevenLabs Music) first, then a built-in track, then the composer.
  if (music) return <Sound music={music} trimBefore={spec.musicMap ? Math.round(startOf(spec.musicMap.downbeat, spec.musicMap.drops, spec.musicMap.seconds, t) * FILM_FPS) : undefined} voiceover={voiceover} spec={spec} timing={t} fade />;
  const track = LIBRARY.find((x) => x.id === spec.track);
  // The film's bars are the music's bars, and its close lands on a drop when the track has one that fits.
  if (track && spec.cues?.length) return <Sound music={null} segments={segmentsOf(track, spec, t)} voiceover={voiceover} spec={spec} timing={t} fade />;
  if (track) return <Sound music={staticFile(`music/${track.id}.mp3`)} trimBefore={Math.round(startOf(track.downbeat ?? track.firstBeat, track.drops ?? [], track.seconds, t) * FILM_FPS)} voiceover={voiceover} spec={spec} timing={t} fade />;
  return <ComposedSound input={input} timing={t} />;
};

/** One track's stretch of a film with several: global frames it plays (crossfades included) and where in the file it starts. */
export type Segment = { src: string; from: number; to: number; trimBefore: number; fadeIn: number; fadeOut: number };

/**
 * A film's tracks as segments: the first from the film's start (as a single track would play), each
 * later one from the start of its beat, its downbeat landing on that beat, the two overlapping half a
 * bar on either side of it.
 */
export function segmentsOf(first: (typeof LIBRARY)[number], spec: FilmInput["spec"], t: ReturnType<typeof filmTiming>["timing"]): Segment[] {
  const half = Math.max(6, Math.round(2 * t.beat));
  const switches = (spec.cues ?? [])
    .map((c) => ({ track: LIBRARY.find((x) => x.id === c.track), at: t.starts[spec.beats.findIndex((b) => b.id === c.from)] }))
    .filter((c): c is { track: (typeof LIBRARY)[number]; at: number } => Boolean(c.track) && Number.isFinite(c.at) && c.at > half && c.at < t.total - half);
  const out: Segment[] = [];
  const firstStart = Math.round(startOf(first.downbeat ?? first.firstBeat, first.drops ?? [], first.seconds, t) * FILM_FPS);
  out.push({ src: staticFile(`music/${first.id}.mp3`), from: 0, to: switches.length ? switches[0].at + half : t.total, trimBefore: firstStart, fadeIn: 0, fadeOut: switches.length ? half * 2 : 0 });
  switches.forEach((c, i) => {
    const next = switches[i + 1];
    const downbeat = Math.round((c.track.downbeat ?? c.track.firstBeat) * FILM_FPS);
    // The new track's downbeat on the beat; when the file has no room before it, it starts on the beat itself.
    const lead = Math.min(half, downbeat);
    out.push({ src: staticFile(`music/${c.track.id}.mp3`), from: c.at - lead, to: next ? next.at + half : t.total, trimBefore: downbeat - lead, fadeIn: half + lead, fadeOut: next ? half * 2 : 0 });
  });
  return out;
}

/** An equal-power envelope for a segment at global frame f: no dip and no bump in the middle of a crossfade. */
const envelope = (s: Segment, f: number) => {
  const up = s.fadeIn ? Math.min(1, Math.max(0, (f - s.from) / s.fadeIn)) : 1;
  const down = s.fadeOut ? Math.min(1, Math.max(0, (s.to - f) / s.fadeOut)) : 1;
  return Math.sin((up * Math.PI) / 2) * Math.sin((down * Math.PI) / 2);
};

/** The music composed for the film's beats. */
const ComposedSound: React.FC<{ input: FilmInput; timing: ReturnType<typeof filmTiming>["timing"] }> = ({ input, timing: t }) => {
  const { spec, voiceover } = input;
  const key = `film:${hashOf(JSON.stringify(spec.score))}:${t.total}:${t.startBeats.join(",")}`;
  const track = useTrack(key, () => composeTrack(spec.score, t));
  return <Sound music={track} voiceover={voiceover} spec={spec} timing={t} />;
};

/** A music bed and the voice-over lines over it, the music dipping under the voice. */
/** Frames a finished bed fades out over at the end of the film (a composed score ends on its own hit). */
const FADE_FRAMES = 36;

const Sound: React.FC<{ music: string | null; segments?: Segment[]; trimBefore?: number; fade?: boolean; voiceover?: Record<number, string>; spec: FilmInput["spec"]; timing: ReturnType<typeof filmTiming>["timing"] }> = ({ music: track, segments, trimBefore, fade, voiceover, spec, timing: t }) => {
  const lead = Math.round(VOICE_LEAD * FILM_FPS);
  const lines = spec.beats.flatMap((b, i) => {
    const src = voiceover?.[i];
    if (!src || !b.voiceSeconds) return [];
    const from = t.starts[i] + lead;
    return [{ src, from, to: from + Math.ceil(b.voiceSeconds * FILM_FPS) }];
  });
  // A bed: quieter under a voice-over; a person's own track first matched to the library's loudness.
  const base = Math.min(1, Math.max(0, (spec.mix?.music ?? defaultLevel(lines.length > 0)) * (spec.mix?.trim ?? 1)));
  const level = (f: number) => {
    let dip = 0;
    for (const l of lines) {
      const into = Math.min(1, Math.max(0, (f - (l.from - DUCK_FRAMES)) / DUCK_FRAMES));
      const out = Math.min(1, Math.max(0, (l.to + DUCK_FRAMES - f) / DUCK_FRAMES));
      dip = Math.max(dip, Math.min(into, out));
    }
    // The bed fades over the film's last bar (the film ends on a bar line), not a fixed second.
    const fadeFrames = Math.max(FADE_FRAMES, Math.round(4 * t.beat));
    const tail = fade ? Math.min(1, Math.max(0, (t.total - f) / fadeFrames)) : 1;
    return base * (1 - (1 - DUCK) * dip) * tail;
  };
  return (
    <>
      {track && base > 0 ? <Audio src={track} trimBefore={trimBefore} volume={lines.length || fade ? level : base} /> : null}
      {base > 0
        ? segments?.map((s, i) => (
            <Sequence key={`m${i}`} from={s.from} durationInFrames={Math.max(1, s.to - s.from)} layout="none">
              <Audio src={s.src} trimBefore={s.trimBefore} volume={(f) => level(f + s.from) * envelope(s, f + s.from)} />
            </Sequence>
          ))
        : null}
      {lines.map((l, i) => (
        <Sequence key={i} from={l.from} durationInFrames={l.to - l.from + 15} layout="none">
          <Audio src={l.src} volume={1} />
        </Sequence>
      ))}
    </>
  );
};
