import { Audio } from "@remotion/media";
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as JSXRuntime from "react/jsx-runtime";
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

/** The music bed under the picture, and how far it dips under a voice line (about -8 dB). */
const MUSIC_LEVEL = 0.65;
const DUCK = 0.4;
const DUCK_FRAMES = 6;

export const filmFrames = (input: FilmInput) => filmTiming(input.spec.beats, input.spec.score).timing.total;

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
      // With a recorded voice, the captions take the bottom band.
      safe: P
        ? { top: Math.round(H * 0.07), bottom: Math.round(H * (voiced ? 0.78 : 0.86)), left: 60, right: W - 60 }
        : { top: 70, bottom: H - (voiced ? 180 : 90), left: 100, right: W - 100 },
    };
  }, [W, H, spec.format, spec.brand, timing.total, beats]);

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
        if (live) setState({ key, ready: true });
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
  // A made bed (ElevenLabs Music) first, then a built-in track, then the composer.
  if (music) return <Sound music={music} voiceover={voiceover} spec={spec} timing={t} fade />;
  const track = LIBRARY.find((x) => x.id === spec.track);
  // The track starts on its first beat, so the film's beat grid (at its tempo) lands on the music's.
  if (track) return <Sound music={staticFile(`music/${track.id}.mp3`)} trimBefore={Math.round(track.firstBeat * FILM_FPS)} voiceover={voiceover} spec={spec} timing={t} fade />;
  return <ComposedSound input={input} timing={t} />;
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

const Sound: React.FC<{ music: string | null; trimBefore?: number; fade?: boolean; voiceover?: Record<number, string>; spec: FilmInput["spec"]; timing: ReturnType<typeof filmTiming>["timing"] }> = ({ music: track, trimBefore, fade, voiceover, spec, timing: t }) => {
  const lead = Math.round(VOICE_LEAD * FILM_FPS);
  const lines = spec.beats.flatMap((b, i) => {
    const src = voiceover?.[i];
    if (!src || !b.voiceSeconds) return [];
    const from = t.starts[i] + lead;
    return [{ src, from, to: from + Math.ceil(b.voiceSeconds * FILM_FPS) }];
  });
  const level = (f: number) => {
    let dip = 0;
    for (const l of lines) {
      const into = Math.min(1, Math.max(0, (f - (l.from - DUCK_FRAMES)) / DUCK_FRAMES));
      const out = Math.min(1, Math.max(0, (l.to + DUCK_FRAMES - f) / DUCK_FRAMES));
      dip = Math.max(dip, Math.min(into, out));
    }
    const tail = fade ? Math.min(1, Math.max(0, (t.total - f) / FADE_FRAMES)) : 1;
    return MUSIC_LEVEL * (1 - (1 - DUCK) * dip) * tail;
  };
  return (
    <>
      {track ? <Audio src={track} trimBefore={trimBefore} volume={lines.length || fade ? level : MUSIC_LEVEL} /> : null}
      {lines.map((l, i) => (
        <Sequence key={i} from={l.from} durationInFrames={l.to - l.from + 15} layout="none">
          <Audio src={l.src} volume={1} />
        </Sequence>
      ))}
    </>
  );
};
