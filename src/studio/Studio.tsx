"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { findUrl, mentions } from "@/director/facts";
import type { CatalogModel, DirectInput, Recent, SiteInfo } from "@/director/input";
import type { MotionFormat, Plan, Tone, VideoInput } from "@/engine/plan";
import { SAMPLE_INPUT } from "@/engine/sample";
import { scoreOf } from "@/music/score";
import { planTiming } from "@/engine/rig";
import { filmTiming } from "@/bespoke/timing";
import { LIBRARY } from "@/music/library";
import type { Sandbox } from "@/bespoke/host";
import { makeFilm, type FilmState, type RecentFilm } from "@/bespoke/agent/run";
import { storedFilmMusic, storedFilmVoice } from "@/bespoke/voice";
import { scaled } from "@/bespoke/agent/images";
import { Editor } from "./Editor";
import { FilmStage } from "./FilmStage";
import { SettingsDialog } from "./Settings";
import { hasNarration, recordNarration, storedNarration } from "@/voice/narrate";
import { DEFAULT_BUDGET_USD, deleteProject, loadProjects, loadSettings, newId, saveProject, saveSettings, voiceReady, type Project, type Settings } from "./store";

const Preview = dynamic(() => import("./Preview"), { ssr: false, loading: () => <div className="preview-wait" aria-hidden="true" /> });

const FORMATS: { id: MotionFormat; label: string; hint: string }[] = [
  { id: "landscape", label: "16:9", hint: "YouTube, X, websites" },
  { id: "portrait", label: "9:16", hint: "Reels, Shorts, TikTok" },
  { id: "square", label: "1:1", hint: "Feed posts" },
];

const TONES: (Tone | "auto")[] = ["auto", "punchy", "polished", "cinematic", "playful", "deadpan", "energetic", "clean"];

/** Starting points: a click fills the brief, which is then the person's to edit. */
const EXAMPLES = [
  "Pengumuman: model baru MiMo V2.6 sekarang tersedia di OneAPI",
  "Video promosi 20 detik untuk oneapi.id",
  "Tutorial singkat pakai OneAPI di Python, 3 langkah",
  "3 reasons developers move to one API key for every model",
];

const ARCHETYPE: Record<Plan["archetype"], string> = {
  promo: "Promo",
  launch: "Launch",
  announcement: "Announcement",
  explainer: "Explainer",
  tutorial: "Tutorial",
  "problem-solution": "Problem and solution",
  versus: "Comparison",
  reasons: "Reasons",
  "one-number": "One number",
};

type Stage = "site" | "design" | "voice" | "film" | null;
/** Product screenshots a bespoke video may remake: each costs the model an image on every step. */
const MAX_REFS = 4;
/** Bespoke: the model writes this video's own code (the default). Quick: the director fills a template plan. */
type Mode = "bespoke" | "plan";
type PlanProject = Project & { plan: Plan };
type Exporting = { state: "idle" } | { state: "running"; progress: number } | { state: "done"; url: string; name: string } | { state: "failed"; message: string };

const recentOf = (p: Plan): Recent => ({ look: p.look, path: p.path, music: p.music, angle: p.angle, tone: p.tone, scenes: p.scenes.map((s) => s.type) });

const hasPlan = (p: Project | null): p is PlanProject => Boolean(p?.plan);
const titleOf = (p: Project) => p.plan?.brand || p.film?.spec.brand.name || p.site?.name || "Video";
const recentFilmOf = (f: FilmState): RecentFilm => ({ style: f.concept.style, metaphor: f.concept.metaphor, world: f.concept.world, genre: f.spec.score.genre, track: f.spec.track });

function inputOf(project: PlanProject, voiceover?: Record<number, string>): VideoInput {
  const input: VideoInput = {
    plan: project.plan,
    format: project.format,
    brand: { name: project.site?.name || project.plan.brand, domain: project.site?.domain ?? "", logo_src: project.site?.logo ?? null },
    shots: [],
  };
  if (voiceover && Object.keys(voiceover).length) input.voiceover = voiceover;
  return input;
}

function slug(s: string) {
  return (s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "video") + ".mp4";
}

export function Studio() {
  const [settings, setSettings] = useState<Settings>({ key: "", model: "" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [brief, setBrief] = useState("");
  const [website, setWebsite] = useState("");
  const [format, setFormat] = useState<MotionFormat>("landscape");
  const [tone, setTone] = useState<Tone | "auto">("auto");
  const [stage, setStage] = useState<Stage>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<Exporting>({ state: "idle" });
  const abort = useRef<AbortController | null>(null);
  // The current video's recorded voiceover lines, as URLs the preview and exporter play.
  const [voice, setVoice] = useState<{ projectId: string; clips: Record<number, string>; missing: boolean } | null>(null);
  const [mode, setMode] = useState<Mode>("bespoke");
  const sandbox = useRef<Sandbox | null>(null);
  const onSandbox = useCallback((s: Sandbox | null) => {
    sandbox.current = s;
  }, []);
  const onFilmError = useCallback((m: string) => setError(`The preview hit an error: ${m}`), []);
  const running = useRef<AbortController | null>(null);
  // Screenshots of the real product for a bespoke video, as image data URLs.
  const [refs, setRefs] = useState<string[]>([]);
  // A bespoke video's recorded voice-over lines, by beat.
  const [filmClips, setFilmClips] = useState<{ projectId: string; clips: Record<number, Blob> } | null>(null);
  // A bespoke video's ElevenLabs music bed, when it has one.
  const [filmMusic, setFilmMusic] = useState<{ projectId: string; blob: Blob } | null>(null);

  // Storage is only readable in the browser, after the first render.
  useEffect(() => {
    const s = loadSettings();
    const list = loadProjects();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
    setSettings(s);
    setProjects(list);
    setCurrent(list[0] ?? null);
    if (list[0]) setFormat(list[0].format);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch("/api/catalog")
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((b: { models: CatalogModel[] }) => setModels(b.models ?? []))
      .catch(() => setModels([]));
  }, []);

  useEffect(() => {
    if (!stage) return;
    const started = Date.now();
    const t = window.setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 500);
    return () => window.clearInterval(t);
  }, [stage]);

  // A finished export's file lives in memory until the next one.
  useEffect(() => () => {
    if (exporting.state === "done") URL.revokeObjectURL(exporting.url);
  }, [exporting]);

  // Recorded lines live in this browser's store; a video opened here finds them again.
  useEffect(() => {
    // A video without a voice keeps none: clips below only match their own project.
    if (!hasPlan(current) || !current.voice || !hasNarration(current.plan)) return;
    let live = true;
    const urls: string[] = [];
    void storedNarration(current.plan, current.voice).then((blobs) => {
      if (!live) return;
      const clips: Record<number, string> = {};
      for (const [scene, blob] of Object.entries(blobs ?? {})) {
        const url = URL.createObjectURL(blob);
        urls.push(url);
        clips[Number(scene)] = url;
      }
      setVoice({ projectId: current.id, clips, missing: !blobs });
    });
    return () => {
      live = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [current]);

  // A bespoke video opened here finds its recorded lines again.
  useEffect(() => {
    const f = current?.film;
    if (!current || !f?.voice || filmClips?.projectId === current.id) return;
    let live = true;
    void storedFilmVoice(f.spec, f.concept.language, f.voice).then((clips) => {
      if (live && clips) setFilmClips({ projectId: current.id, clips });
    });
    return () => {
      live = false;
    };
  }, [current, filmClips]);

  // ...and its music bed.
  useEffect(() => {
    const key = current?.film?.musicKey;
    if (!current || !key || filmMusic?.projectId === current.id) return;
    let live = true;
    void storedFilmMusic(key).then((blob) => {
      if (live && blob) setFilmMusic({ projectId: current.id, blob });
    });
    return () => {
      live = false;
    };
  }, [current, filmMusic]);

  const mine = voice && current?.voice && voice.projectId === current.id ? voice : null;
  const clips = mine?.clips;
  const input = useMemo(() => (hasPlan(current) ? inputOf({ ...current, format }, clips) : { ...SAMPLE_INPUT, format }), [current, format, clips]);
  const ready = Boolean(settings.key && settings.model);

  /**
   * Records a video's voiceover with the voice in Settings (lines already
   * recorded with it are reused) and saves the plan timed to its lines. A
   * failure keeps the video, which then plays without a voice.
   */
  const recordVoice = useCallback(
    async (project: PlanProject): Promise<Project> => {
      if (!voiceReady(settings) || !hasNarration(project.plan)) return project;
      setStage("voice");
      try {
        const choice = { voiceId: settings.voice.voiceId, voiceName: settings.voice.voiceName };
        const rec = await recordNarration(project.plan, settings.voice.key, choice);
        const updated = { ...project, plan: rec.plan, voice: choice };
        setProjects(saveProject(updated));
        setCurrent(updated);
        return updated;
      } catch (err) {
        setError(`The voiceover could not be recorded (${err instanceof Error ? err.message : String(err)}). The video plays without it.`);
        return project;
      } finally {
        setStage(null);
      }
    },
    [settings],
  );

  /** The website: the one typed in, else one named in the brief, else OneAPI's own when the brief is about it. */
  const findSite = useCallback(async (opts: { brief: string; website: string; site?: SiteInfo | null }): Promise<SiteInfo | null> => {
    if (opts.site !== undefined) return opts.site;
    const explicit = opts.website.trim();
    const target = explicit || findUrl(opts.brief) || (mentions(opts.brief, "oneapi") ? "oneapi.id" : "");
    if (!target) return null;
    setStage("site");
    const res = await fetch("/api/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target }) });
    const body = (await res.json()) as { site?: SiteInfo; error?: string };
    if (res.ok && body.site) return body.site;
    if (explicit) throw new Error(body.error ?? "That website could not be opened.");
    return null;
  }, []);

  const design = useCallback(
    async (opts: { brief: string; website: string; site?: SiteInfo | null; previous?: Plan; replace?: Project }) => {
      if (!ready) {
        setSettingsOpen(true);
        return;
      }
      setError(null);
      setEditing(false);
      setExporting({ state: "idle" });
      setSeconds(0);
      try {
        const site = await findSite(opts);
        setStage("design");
        const recent = projects.filter((p): p is PlanProject => p.id !== opts.replace?.id && hasPlan(p)).slice(0, 3).map((p) => recentOf(p.plan));
        const payload: Partial<DirectInput> & { model: string } = {
          prompt: opts.brief,
          format,
          tone,
          // The logo is for the picture, not for the director.
          site: site ? { ...site, logo: null } : null,
          previous: opts.previous ? recentOf(opts.previous) : undefined,
          recent,
          model: settings.model,
          narration: voiceReady(settings),
        };
        const res = await fetch("/api/direct", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-OneAPI-Key": settings.key },
          body: JSON.stringify(payload),
        });
        const body = (await res.json()) as { plan?: Plan; error?: string };
        if (!res.ok || !body.plan) throw new Error(body.error ?? "The video could not be designed. Try again.");
        const project: PlanProject = {
          id: opts.replace?.id ?? newId(),
          createdAt: new Date().toISOString(),
          brief: opts.brief,
          website: opts.website,
          format,
          tone,
          site,
          plan: body.plan,
        };
        setProjects(saveProject(project));
        setCurrent(project);
        setStage(null);
        await recordVoice(project);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setStage(null);
      }
    },
    [ready, projects, format, tone, settings, recordVoice, findSite],
  );

  /**
   * A bespoke video: the creative director's concept, then the agent writes
   * the scene, rendering and looking at it until it is good. The project is
   * saved after every step, and the preview follows every version that
   * passes the check.
   */
  const makeBespoke = useCallback(
    async (opts: { brief: string; website: string; site?: SiteInfo | null; replace?: Project }) => {
      if (!ready) {
        setSettingsOpen(true);
        return;
      }
      setError(null);
      setEditing(false);
      setExporting({ state: "idle" });
      setSeconds(0);
      const ctrl = new AbortController();
      running.current = ctrl;
      try {
        const site = await findSite(opts);
        setStage("film");
        const base: Project = { id: opts.replace?.id ?? newId(), createdAt: new Date().toISOString(), brief: opts.brief, website: opts.website, format, tone, site };
        setCurrent(base);
        const keep = (film: FilmState) => {
          const p = { ...base, film };
          setCurrent(p);
          setProjects(saveProject(p));
        };
        const recent = projects.filter((p) => p.film && p.id !== base.id).slice(0, 4).map((p) => recentFilmOf(p.film as FilmState));
        const film = await makeFilm({
          key: settings.key,
          model: settings.model,
          brief: opts.brief,
          site,
          format,
          models,
          recent,
          budgetUsd: settings.budgetUsd ?? DEFAULT_BUDGET_USD,
          refs,
          sandbox: () => sandbox.current,
          voice: voiceReady(settings) ? { apiKey: settings.voice.key, voiceId: settings.voice.voiceId, voiceName: settings.voice.voiceName } : undefined,
          onVoice: (clips) => setFilmClips({ projectId: base.id, clips }),
          onMusic: (blob) => setFilmMusic({ projectId: base.id, blob }),
          onConcept: keep,
          update: keep,
          signal: ctrl.signal,
        });
        if (film.status === "failed") setError(film.summary);
      } catch (err) {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        running.current = null;
        setStage(null);
      }
    },
    [ready, projects, format, tone, settings, models, findSite, refs],
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (stage || (!brief.trim() && !website.trim())) return;
    if (mode === "bespoke") void makeBespoke({ brief: brief.trim(), website });
    else void design({ brief: brief.trim(), website });
  }

  async function startExport() {
    if (!current) return;
    if (current.film) return exportFilm(current.film);
    if (!hasPlan(current)) return;
    const { checkExport, exportMp4 } = await import("./exporter");
    const check = await checkExport(format);
    if (!check.ok) {
      setExporting({ state: "failed", message: `This browser cannot export video (${check.reason}). Use Chrome or Edge on a computer, or render with the CLI: npm run render.` });
      return;
    }
    abort.current = new AbortController();
    setExporting({ state: "running", progress: 0 });
    try {
      const blob = await exportMp4(inputOf({ ...current, format }, clips), (p) => setExporting({ state: "running", progress: p }), abort.current.signal);
      setExporting({ state: "done", url: URL.createObjectURL(blob), name: slug(current.plan.brand || current.brief) });
    } catch (err) {
      setExporting(abort.current.signal.aborted ? { state: "idle" } : { state: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function exportFilm(film: FilmState) {
    const box = sandbox.current;
    if (!box || !film.modules) return;
    abort.current = new AbortController();
    setExporting({ state: "running", progress: 0 });
    try {
      const blob = await box.exportMp4({ spec: film.spec, modules: film.modules, voiceover, music }, (p) => setExporting({ state: "running", progress: p }), abort.current.signal);
      setExporting({ state: "done", url: URL.createObjectURL(blob), name: slug(film.spec.brand.name || film.concept.title) });
    } catch (err) {
      setExporting(abort.current.signal.aborted ? { state: "idle" } : { state: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const plan = current?.plan ?? null;
  const film = current?.film ?? null;
  const voiceover = filmClips && filmClips.projectId === current?.id ? filmClips.clips : undefined;
  const music = filmMusic && filmMusic.projectId === current?.id ? filmMusic.blob : undefined;
  const isFilm = Boolean(current && !current.plan);
  const length = plan ? Math.round(planTiming(plan).total / 30) : 0;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="wordmark">OneMotion</span>
          <span className="by">
            by{" "}
            <a href="https://oneapi.id" target="_blank" rel="noreferrer">
              OneAPI
            </a>
          </span>
        </div>
        <button type="button" className="btn ghost" onClick={() => setSettingsOpen(true)}>
          {ready ? `Model: ${settings.model}` : "Add your OneAPI key"}
        </button>
      </header>

      <main className="studio">
        <section className="compose" aria-labelledby="compose-title">
          <h1 id="compose-title">Describe a video.</h1>
          <p className="lead">
            A promo, an announcement, a tutorial or a comparison, in any language. An AI art director invents a look for it, an AI motion
            designer writes the video&apos;s own code and checks its frames, and your browser renders the MP4.
          </p>
          <form onSubmit={submit} className="stack">
            <label className="field">
              <span>Your brief</span>
              <textarea
                rows={4}
                maxLength={600}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Pengumuman: model baru MiMo V2.6 sekarang tersedia di OneAPI"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
                }}
                disabled={Boolean(stage)}
              />
            </label>
            <div className="examples" role="group" aria-label="Examples">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="example" onClick={() => setBrief(ex)} disabled={Boolean(stage)}>
                  {ex}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Website, if there is one</span>
              <input type="text" inputMode="url" spellCheck={false} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourbrand.com" disabled={Boolean(stage)} />
            </label>
            {mode === "bespoke" ? (
              <div className="field">
                <span>Screenshots of your product, if you want its real UI in the video</span>
                <div className="refs">
                  {refs.map((url, i) => (
                    <button key={i} type="button" className="ref" title="Remove" onClick={() => setRefs((r) => r.filter((_, k) => k !== i))} disabled={Boolean(stage)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Screenshot ${i + 1}`} />
                    </button>
                  ))}
                  {refs.length < MAX_REFS ? (
                    <label className="ref add">
                      +
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        disabled={Boolean(stage)}
                        onChange={async (e) => {
                          const files = [...(e.target.files ?? [])].slice(0, MAX_REFS - refs.length);
                          e.target.value = "";
                          const urls = await Promise.all(files.map((f) => scaled(f, 1280).catch(() => null)));
                          setRefs((r) => [...r, ...urls.filter((u): u is string => Boolean(u))].slice(0, MAX_REFS));
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="row wrap">
              <div className="seg" role="radiogroup" aria-label="Video size">
                {FORMATS.map((f) => (
                  <button key={f.id} type="button" role="radio" aria-checked={format === f.id} title={f.hint} onClick={() => setFormat(f.id)}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="seg" role="radiogroup" aria-label="How the video is made">
                <button type="button" role="radio" aria-checked={mode === "bespoke"} title="The model writes this video's own animation code: every video looks different. A few minutes and about $1 to $3 on your key." onClick={() => setMode("bespoke")}>
                  Bespoke
                </button>
                <button type="button" role="radio" aria-checked={mode === "plan"} title="The director fills a template: fast and cheap, but videos look alike." onClick={() => setMode("plan")}>
                  Quick
                </button>
              </div>
              {mode === "plan" ? (
                <label className="inline">
                  <span>Tone</span>
                  <select value={tone} onChange={(e) => setTone(e.target.value as Tone | "auto")}>
                    {TONES.map((t) => (
                      <option key={t} value={t}>
                        {t === "auto" ? "Director picks" : t[0].toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <button type="submit" className="btn primary big" disabled={Boolean(stage) || (!brief.trim() && !website.trim())}>
              {stage === "site"
                ? `Reading the website… ${seconds}s`
                : stage === "design"
                  ? `Designing… ${seconds}s`
                  : stage === "voice"
                    ? `Recording the voiceover… ${seconds}s`
                    : stage === "film"
                      ? `${film ? "Building" : "Writing the concept"}… ${seconds}s`
                      : "Make the video"}
            </button>
            {stage === "film" ? (
              <button type="button" className="btn" onClick={() => running.current?.abort()}>
                Stop
              </button>
            ) : null}
            {!ready ? (
              <p className="hint">
                You need a OneAPI API key first.{" "}
                {mode === "bespoke" ? "A bespoke video takes a few minutes and many model steps on your key; use a model that reads images." : "Designing a video costs one chat request on your key."}
              </p>
            ) : null}
            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
          </form>

          {projects.length ? (
            <div className="recent">
              <h2>Your videos</h2>
              <p className="hint">Kept in this browser only.</p>
              <ul>
                {projects.map((p) => (
                  <li key={p.id} aria-current={p.id === current?.id ? "true" : undefined}>
                    <button
                      type="button"
                      className="recent-open"
                      disabled={Boolean(stage)}
                      onClick={() => {
                        setCurrent(p);
                        setFormat(p.format);
                        setEditing(false);
                        setExporting({ state: "idle" });
                      }}
                    >
                      <strong>{titleOf(p)}</strong>
                      <span>{p.brief || p.website}</span>
                    </button>
                    <button type="button" className="btn ghost small" aria-label={`Delete ${titleOf(p)}`} disabled={Boolean(stage)} onClick={() => {
                      const list = deleteProject(p.id);
                      setProjects(list);
                      if (current?.id === p.id) setCurrent(list[0] ?? null);
                    }}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className={`stage stage-${format}`} aria-label="Preview">
          <div className="frame">
            {isFilm ? <FilmStage film={film} format={format} voiceover={voiceover} music={music} onSandbox={onSandbox} onError={onFilmError} /> : <Preview input={input} />}
          </div>
          {isFilm && current ? (
            <div className="meta">
              <div>
                <h2>{film?.concept.title || titleOf(current)}</h2>
                {current.brief ? <p className="brief">{current.brief}</p> : null}
                {film ? <p className="angle">{film.concept.angle}</p> : null}
                {film ? (
                  <p className="facts">
                    {[
                      film.concept.style,
                      film.musicKey ? "ElevenLabs music" : film.spec.track ? `music: ${LIBRARY.find((x) => x.id === film.spec.track)?.title ?? film.spec.track}` : `${film.spec.score.genre} music (composed)`,
                      `${Math.round(filmTiming(film.spec.beats, film.spec.score).timing.total / 30)}s`,
                      film.status === "building" ? "building" : film.status === "done" ? "finished" : film.status === "stopped" ? "stopped early" : "failed",
                      film.reviews?.length ? `art director ${film.reviews[film.reviews.length - 1].score}/10` : "",
                      film.spend.usd ? `$${film.spend.usd.toFixed(2)} on your key` : `${Math.round((film.spend.input + film.spend.output) / 1000)}k tokens`,
                    ]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </p>
                ) : null}
              </div>
              {film?.log.length ? (
                <ol className="agent-log" aria-label="What the AI is doing">
                  {film.log
                    .slice(-60)
                    .reverse()
                    .map((e, i) => (
                      <li key={film.log.length - i} className={`log-${e.kind}`}>
                        {e.text}
                      </li>
                    ))}
                </ol>
              ) : null}
              <div className="row wrap">
                {exporting.state === "running" ? (
                  <button type="button" className="btn" onClick={() => abort.current?.abort()}>
                    Rendering {Math.round(exporting.progress * 100)}%  ·  Cancel
                  </button>
                ) : exporting.state === "done" ? (
                  <a className="btn primary" href={exporting.url} download={exporting.name}>
                    Download MP4
                  </a>
                ) : (
                  <button type="button" className="btn primary" onClick={startExport} disabled={Boolean(stage) || !film?.modules}>
                    Export MP4
                  </button>
                )}
                <button type="button" className="btn" disabled={Boolean(stage) || exporting.state === "running"} onClick={() => void makeBespoke({ brief: current.brief, website: current.website, site: current.site })}>
                  Another take
                </button>
              </div>
              {exporting.state === "failed" ? (
                <p className="error" role="alert">
                  {exporting.message}
                </p>
              ) : null}
            </div>
          ) : hasPlan(current) && plan ? (
            <div className="meta">
              <div>
                <h2>{plan.brand || current.site?.name || "Your video"}</h2>
                {current.brief ? <p className="brief">{current.brief}</p> : null}
                <p className="angle">{plan.angle}</p>
                <p className="facts">
                  {[ARCHETYPE[plan.archetype], `${plan.look} room`, `${plan.path} camera`, `${scoreOf(plan).genre} music`, clips && current.voice ? `${current.voice.voiceName} voice` : "", `${length}s`]
                    .filter(Boolean)
                    .join("  ·  ")}
                </p>
                {hasNarration(plan) && (!current.voice || mine?.missing) && voiceReady(settings) ? (
                  <button type="button" className="btn small" disabled={Boolean(stage)} onClick={() => void recordVoice(current)}>
                    Record the voiceover ({settings.voice.voiceName})
                  </button>
                ) : null}
              </div>
              {plan.caption ? (
                <div className="caption">
                  <p>{plan.caption}</p>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={async () => {
                      await navigator.clipboard.writeText(plan.caption).catch(() => {});
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? "Copied" : "Copy caption"}
                  </button>
                </div>
              ) : null}
              <div className="row wrap">
                {exporting.state === "running" ? (
                  <button type="button" className="btn" onClick={() => abort.current?.abort()}>
                    Rendering {Math.round(exporting.progress * 100)}%  ·  Cancel
                  </button>
                ) : exporting.state === "done" ? (
                  <a className="btn primary" href={exporting.url} download={exporting.name}>
                    Download MP4
                  </a>
                ) : (
                  <button type="button" className="btn primary" onClick={startExport} disabled={Boolean(stage)}>
                    Export MP4
                  </button>
                )}
                <button
                  type="button"
                  className="btn"
                  disabled={Boolean(stage) || exporting.state === "running"}
                  onClick={() => void design({ brief: current.brief, website: current.website, site: current.site, previous: current.plan })}
                >
                  Another take
                </button>
                <button type="button" className="btn" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
                  {editing ? "Close editor" : "Edit text"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  title="For rendering on your own machine: npm run render -- file.json"
                  onClick={() => {
                    const doc = JSON.stringify(inputOf({ ...current, format }), null, 2);
                    const url = URL.createObjectURL(new Blob([doc], { type: "application/json" }));
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = slug(current.plan.brand || current.brief).replace(/\.mp4$/, ".json");
                    a.click();
                    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  Download plan
                </button>
              </div>
              {exporting.state === "running" ? (
                <p className="hint">Rendering in this tab. Keep it open; it runs at about the length of the video or faster on a recent computer.</p>
              ) : null}
              {exporting.state === "failed" ? (
                <p className="error" role="alert">
                  {exporting.message}
                </p>
              ) : null}
              {editing ? (
                <Editor
                  key={current.id + plan.angle}
                  plan={plan}
                  input={{ prompt: current.brief, format, tone: current.tone, site: current.site }}
                  onSave={(next) => {
                    const updated = { ...current, plan: next };
                    setProjects(saveProject(updated));
                    setCurrent(updated);
                    // Changed lines are read again; unchanged ones come from the store.
                    if (updated.voice && hasNarration(next)) void recordVoice(updated);
                  }}
                />
              ) : null}
            </div>
          ) : (
            <p className="hint example-note">An example made from the brief “MiMo V2.6 Flash is now on OneAPI”. Yours will appear here.</p>
          )}
        </section>
      </main>

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        models={models}
        onClose={() => setSettingsOpen(false)}
        onSave={(s) => {
          saveSettings(s);
          setSettings(s);
          setSettingsOpen(false);
        }}
      />
    </div>
  );
}
