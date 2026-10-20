"use client";

import { useEffect, useMemo, useState } from "react";
import type { FilmState } from "@/bespoke/agent/run";
import { inferLocks, NO_LOCKS, type Locks } from "@/bespoke/agent/revise";
import { placeOf, type Pin } from "@/bespoke/textEdit";
import { timecode } from "./Timeline";
import { LIBRARY } from "@/music/library";
import { defaultLevel } from "@/music/mix";
import { speech, type Pronunciation } from "@/voice/spoken";
import { PronunciationEditor } from "./Pronunciations";

/**
 * Editing a finished bespoke film without making it again, as panes of the
 * inspector: a note to the AI editor (with what may and may not change),
 * the narration line by line, and the music. Each change makes a new
 * version that can be undone.
 */

/** What a note may change, as one choice: each sets the locks it implies. */
const SCOPES: { id: string; label: string; locks: Partial<Locks> }[] = [
  { id: "all", label: "Whatever the note needs", locks: {} },
  { id: "visuals", label: "Visuals only", locks: { narration: true, text: true, structure: true, music: true } },
  { id: "words", label: "Words and narration", locks: { visuals: true, music: true, structure: true } },
  { id: "music", label: "Music only", locks: { narration: true, text: true, structure: true, visuals: true } },
];

const LOCK_LABELS: Record<keyof Locks, string> = { narration: "Narration", text: "On-screen text", structure: "Scenes and lengths", music: "Music", visuals: "Visuals" };

const IDEAS = ["Make it feel more cinematic", "Bigger, bolder typography", "Make the animation more satisfying", "Tighten the pacing around the music", "Make the opening more dramatic", "Reduce repetitive movements"];

export type ImproveResult = { summary: string; refused: string[]; changed: { code: boolean; voice: number; music: boolean } } | null;

export function ImprovePane(o: {
  film: FilmState;
  busy: boolean;
  ready: boolean;
  targets: string[];
  onTargets: (ids: string[]) => void;
  result: ImproveResult;
  onImprove: (note: string, locks: Locks, targets: string[]) => void;
  /** The place on the video the note is about, and pointing at one. */
  pin: Pin | null;
  pointing: boolean;
  onPointing: (on: boolean) => void;
  onUnpin: () => void;
}) {
  const [note, setNote] = useState("");
  const [scope, setScope] = useState("all");
  const [manual, setManual] = useState<Locks>(NO_LOCKS);
  const inferred = useMemo(() => inferLocks(note), [note]);
  const scoped = SCOPES.find((s) => s.id === scope)?.locks ?? {};
  const locks: Locks = Object.fromEntries((Object.keys(NO_LOCKS) as (keyof Locks)[]).map((k) => [k, Boolean(manual[k] || inferred[k] || scoped[k])])) as Locks;
  const beats = o.film.spec.beats;
  return (
    <form
      className="pane"
      onSubmit={(e) => {
        e.preventDefault();
        if (note.trim()) o.onImprove(note.trim(), locks, o.targets);
      }}
    >
      <div className="pane-intro">
        <h3>Improve with AI</h3>
        <p>Tell the editor what to change. It edits this video in place, keeps what you lock, and every change can be undone.</p>
      </div>
      <label className="field">
        <span>Your note</span>
        <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={o.pin ? "What should change here? e.g. this headline is too big" : "Keep the narration, make the type bolder and the opening calmer."} disabled={o.busy} />
      </label>
      <div className="pin-row">
        {o.pin ? (
          <p className="pin-chip">
            <span className="pin-dot" aria-hidden="true" />
            <span>
              About <span className="mono">{timecode(o.pin.frame)}</span>
              {o.pin.beat ? ` in ${o.pin.beat}` : ""}, {placeOf(o.pin.x, o.pin.y)}
              {o.pin.words ? <>, on &ldquo;{o.pin.words.slice(0, 40)}&rdquo;</> : null}
            </span>
            <button type="button" className="btn small ghost" onClick={o.onUnpin} disabled={o.busy}>
              Remove
            </button>
          </p>
        ) : (
          <button type="button" className={`btn small${o.pointing ? " primary" : ""}`} aria-pressed={o.pointing} onClick={() => o.onPointing(!o.pointing)} disabled={o.busy}>
            {o.pointing ? "Click the place on the video" : "Point at the video"}
          </button>
        )}
        <small className="hint">{o.pin ? "The editor gets the time, the scene and the place with your note." : "Pause where something is wrong and point at it: the note then says exactly where."}</small>
      </div>
      <div className="chips" role="group" aria-label="Start from an idea">
        {IDEAS.map((i) => (
          <button key={i} type="button" className="chip" onClick={() => setNote(i)} disabled={o.busy}>
            {i}
          </button>
        ))}
      </div>
      <label className="field">
        <span>May change</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)} disabled={o.busy}>
          {SCOPES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="locks">
        <legend>Keep as it is</legend>
        {(Object.keys(LOCK_LABELS) as (keyof Locks)[]).map((k) => (
          <label key={k} className="check">
            <input type="checkbox" checked={locks[k]} disabled={o.busy || Boolean(inferred[k] || scoped[k])} onChange={(e) => setManual((m) => ({ ...m, [k]: e.target.checked }))} />
            <span>
              {LOCK_LABELS[k]}
              {inferred[k] ? <em> · your note asks</em> : null}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="field">
        <span>Scenes</span>
        <div className="chips" role="group" aria-label="Scenes to change">
          {beats.map((b) => (
            <button key={b.id} type="button" className="chip" aria-pressed={o.targets.includes(b.id)} title={b.shows} onClick={() => o.onTargets(o.targets.includes(b.id) ? o.targets.filter((x) => x !== b.id) : [...o.targets, b.id])} disabled={o.busy}>
              <span className="mono">{b.id}</span> {b.says || "…"}
            </button>
          ))}
        </div>
        <small className="hint">{o.targets.length ? "Only the selected scenes change." : "None selected: the whole video. You can also shift-click scenes on the timeline."}</small>
      </div>
      <button type="submit" className="btn primary block" disabled={o.busy || !o.ready || !note.trim()}>
        {o.busy ? "Working on it…" : "Apply note"}
      </button>
      {!o.ready ? <p className="hint">Add your OneAPI key and a model in Settings to use the editor.</p> : null}
      {o.result ? (
        <div className="result" role="status">
          <p>{o.result.summary || "Done."}</p>
          <p className="hint">{[o.result.changed.code ? "Code edited" : "Code untouched", o.result.changed.voice ? `${o.result.changed.voice} voice line${o.result.changed.voice === 1 ? "" : "s"} re-recorded` : "Narration untouched", o.result.changed.music ? "Music changed" : ""].filter(Boolean).join(" · ")}</p>
          {o.result.refused.length ? (
            <ul className="hint">
              {o.result.refused.map((r) => (
                <li key={r}>Kept: {r}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

export function NarrationPane(o: { film: FilmState; busy: boolean; canVoice: boolean; language: string; lexicon: Pronunciation[]; projectLexicon: Pronunciation[]; clips?: Record<number, Blob>; onLine: (index: number, text: string) => void; onProjectLexicon: (list: Pronunciation[]) => void }) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [playing, setPlaying] = useState<HTMLAudioElement | null>(null);
  useEffect(() => () => playing?.pause(), [playing]);
  const play = (blob: Blob) => {
    playing?.pause();
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.onended = () => URL.revokeObjectURL(url);
    void a.play().catch(() => {});
    setPlaying(a);
  };
  return (
    <div className="pane">
      <div className="pane-intro">
        <h3>Narration</h3>
        <p>Edit a line and record it again: only that line is re-recorded, and the video re-times around it. Captions show the line as written.</p>
      </div>
      <ol className="lines">
        {o.film.spec.beats.map((b, i) => {
          const text = drafts[i] ?? b.voice ?? "";
          const changed = text.trim() !== (b.voice ?? "").trim();
          const said = speech(text, o.language, o.lexicon).tts;
          const clip = o.clips?.[i];
          return (
            <li key={b.id}>
              <div className="line-head">
                <span className="mono">{b.id}</span>
                <span className="hint mono">{b.voiceSeconds ? `${b.voiceSeconds.toFixed(1)}s recorded` : "not recorded"}</span>
              </div>
              <textarea rows={2} value={text} onChange={(e) => setDrafts((d) => ({ ...d, [i]: e.target.value }))} disabled={o.busy} aria-label={`Narration of ${b.id}`} />
              {said !== text ? (
                <p className="said">
                  <span>Said as</span> {said}
                </p>
              ) : null}
              <div className="row">
                {clip && !changed ? (
                  <button type="button" className="btn small" onClick={() => play(clip)}>
                    Play
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn small"
                  disabled={o.busy || (!changed && Boolean(b.words?.length && clip)) || !text.trim()}
                  onClick={() => {
                    o.onLine(i, text.trim());
                    setDrafts((d) => {
                      const rest = { ...d };
                      delete rest[i];
                      return rest;
                    });
                  }}
                  title={o.canVoice ? "Record this line again with your voice" : "Saves the line; turn on the voiceover in Settings to record it"}
                >
                  {o.canVoice ? (changed ? "Save and record" : "Record") : "Save line"}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <details className="disclosure">
        <summary>Pronunciations for this video</summary>
        <PronunciationEditor value={o.projectLexicon} onChange={o.onProjectLexicon} language={o.language} hint="Used for this video only, over the ones in Settings." />
      </details>
    </div>
  );
}

/** The largest track a person can bring: a few minutes of high-quality audio. */
const MAX_UPLOAD = 30 * 1024 * 1024;

/** A person's own track's name, kept in its store key ("film-music|upload|name|size"). */
export const uploadName = (key?: string) => (key?.startsWith("film-music|upload|") ? key.split("|")[2] : null);

export function MusicPane({ film, busy, onMusic }: { film: FilmState; busy: boolean; onMusic: (patch: { track?: string; level?: number; off?: boolean; upload?: File }) => void }) {
  const level = film.spec.mix?.music ?? defaultLevel(film.spec.beats.some((b) => Boolean(b.voiceSeconds)));
  const off = Boolean(film.spec.mix?.off);
  const own = uploadName(film.musicKey);
  const [uploadError, setUploadError] = useState<string | null>(null);
  return (
    <div className="pane">
      <div className="pane-intro">
        <h3>Music</h3>
        <p>Scenes snap to the track&apos;s beat. Changing it never regenerates the picture or the narration.</p>
      </div>
      <label className="switch">
        <input type="checkbox" role="switch" checked={!off} onChange={(e) => onMusic({ off: !e.target.checked })} disabled={busy} />
        <span>Music under the video</span>
      </label>
      <label className="field">
        <span>Track</span>
        <select value={film.musicKey ? "" : (film.spec.track ?? "")} onChange={(e) => onMusic({ track: e.target.value })} disabled={busy || off}>
          {film.musicKey ? <option value="">{own ? `Your track: ${own}` : "ElevenLabs music made for this video"}</option> : null}
          {!film.spec.track && !film.musicKey ? <option value="">Composed for this video</option> : null}
          {LIBRARY.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} · {t.bpm} BPM
            </option>
          ))}
        </select>
        <small className="hint">{LIBRARY.find((t) => t.id === film.spec.track)?.mood ?? ""}</small>
      </label>
      <div className="field">
        <span>Use your own track</span>
        <label className="btn upload">
          {own ? "Replace your track" : "Choose an audio file"}
          <input
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/ogg"
            disabled={busy || off}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (!file.type.startsWith("audio/")) return setUploadError("That file is not audio. Use an mp3, wav, m4a or ogg file.");
              if (file.size > MAX_UPLOAD) return setUploadError("That file is over 30 MB. Use a shorter or compressed version (an mp3 is plenty).");
              setUploadError(null);
              onMusic({ upload: file });
            }}
          />
        </label>
        <small className={uploadError ? "error" : "hint"}>{uploadError ?? "An mp3, wav, m4a or ogg up to 30 MB. It is matched to the library's loudness, plays from its start, fades out over the last bar and stays on this device. Only use music you have the rights to."}</small>
      </div>
      <label className="field">
        <span>
          Level <span className="mono">{Math.round(level * 100)}%</span>
        </span>
        <input type="range" min={0} max={1} step={0.05} value={level} onChange={(e) => onMusic({ level: Number(e.target.value) })} disabled={busy || off} />
        <small className="hint">A background bed: 32% with a voice-over, 45% without, unless you set it. Dips about 8 dB under each voice line and fades out over the last bar.</small>
      </label>
    </div>
  );
}
