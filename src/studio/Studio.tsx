"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findUrl, findUrls } from "@/director/facts";
import type { CatalogModel, DirectInput, Recent, SiteInfo } from "@/director/input";
import { DIMENSIONS, type MotionFormat, type Plan, type Tone, type VideoInput } from "@/engine/plan";
import { SAMPLE_INPUT } from "@/engine/sample";
import { scoreOf } from "@/music/score";
import { planTiming } from "@/engine/rig";
import { FILM_FPS, filmTiming } from "@/bespoke/timing";
import { LIBRARY } from "@/music/library";
import type { FilmHost } from "@/bespoke/host";
import { makeFilm, reviseFilm, type FilmState, type RecentFilm } from "@/bespoke/agent/run";
import { aiHeaders, setBackupModel, setEndpoint } from "@/bespoke/agent/llm";
import { brokenCues, type Locks } from "@/bespoke/agent/revise";
import { normalizeConcept } from "@/bespoke/agent/concept";
import type { FilmSpec } from "@/bespoke/film";
import { normalizeScore } from "@/music/score";
import { recordFilmVoice, storedFilmMusic, storedFilmVoice, unrecorded } from "@/bespoke/voice";
import type { Pronunciation } from "@/voice/spoken";
import { ImprovePane, MusicPane, NarrationPane, uploadName, type ImproveResult } from "./FilmPanel";
import { createTransport, Timeline } from "./Timeline";
import { TextPane } from "./TextPane";
import { BuildProgress } from "./BuildProgress";
import { visibleText } from "./frameText";
import { addColorEdit, addEdit, pinnedNote, recolor, replaceScreenText, type Pin, type ScreenText } from "@/bespoke/textEdit";
import { compile } from "@/bespoke/agent/tools";
import { loadHistory, record, step } from "./history";
import { Editor } from "./Editor";

import { SettingsView } from "./Settings";
import { CreateWizard } from "./CreateWizard";
import { formatLine, ideaFromBrief, isWebsite, needsProductionBrief, partnerInfo, siteOf, withProductionBrief, type Partner, type TemplateId } from "./briefs";
import { writeBrief } from "./suggest";
import { hasNarration, recordNarration, storedNarration } from "@/voice/narrate";
import { putLine } from "@/voice/cache";
import { matchGain, rmsDb } from "@/music/mix";
import { analyzeMusic, type MusicMap } from "@/music/analyze";
import { aiOf, backupOf, deleteProject, lexiconOf, loadProjects, recoverInterrupted, loadSettings, newId, saveProject, saveSettings, voiceReady, type Project, type Settings } from "./store";

const Preview = dynamic(() => import("./Preview"), { ssr: false, loading: () => <div className="preview-wait" aria-hidden="true" /> });
const FilmStage = dynamic(() => import("./FilmStage"), { ssr: false, loading: () => <div className="preview-wait" aria-hidden="true" /> });


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
/** The inspector's panes. */
type Tab = "create" | "improve" | "text" | "narration" | "music" | "details" | "edit";
/** How long a brief may be: Quick turns it into one small plan; Bespoke reads a full storyboard. */
const MAX_BRIEF: Record<Mode, number> = { plan: 600, bespoke: 20_000 };

/** Names of the agents of a bespoke run, and the order their lines show in: the film's own steps, the lead, the beats, the review. */
const WHO: Record<string, string> = { film: "Film", lead: "Lead", review: "Review" };
const ORDER = (who: string) => (who === "film" ? 0 : who === "lead" ? 1 : who === "review" ? 999 : 2 + (Number(who.replace(/\D/g, "")) || 0));

/** Product screenshots a bespoke video may remake: each costs the model an image on every step. */
const MAX_REFS = 4;
/** Bespoke: the model writes this video's own code (the default). Quick: the director fills a template plan. */
type Mode = "bespoke" | "plan";
type PlanProject = Project & { plan: Plan };
/** How much of the export bar the render takes; mastering the sound takes the rest. */
const RENDER_SHARE = 0.9;

type Exporting = { state: "idle" } | { state: "running"; progress: number } | { state: "done"; url: string; name: string } | { state: "failed"; message: string };

const recentOf = (p: Plan): Recent => ({ look: p.look, path: p.path, music: p.music, angle: p.angle, tone: p.tone, scenes: p.scenes.map((s) => s.type) });

const hasPlan = (p: Project | null): p is PlanProject => Boolean(p?.plan);
const titleOf = (p: Project) => p.film?.concept.title || p.plan?.brand || p.film?.spec.brand.name || p.site?.name || "Untitled video";
const recentFilmOf = (f: FilmState): RecentFilm => {
  // Films saved before concepts had a look have none.
  const look = (f.concept as Partial<typeof f.concept>).look;
  return { style: f.concept.style, metaphor: f.concept.metaphor, world: f.concept.world, genre: f.spec.score.genre, track: f.spec.track, direction: look?.direction, concept: look?.concept, background: look?.backgroundMotion, signature: look?.signature, display: f.concept.typography.display };
};

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

/** The wizard's hero preview plays on its own: its host is not the one that renders. */
const ignoreHost = () => undefined;
const ignoreError = () => undefined;

export function Studio() {
  const [settings, setSettings] = useState<Settings>({ key: "", model: "" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [brief, setBrief] = useState("");
  const [website, setWebsite] = useState("");
  /** A collaboration video's partner brand, or null. */
  const [partner, setPartner] = useState<Partner | null>(null);
  const [format, setFormat] = useState<MotionFormat>("landscape");
  const [tone, setTone] = useState<Tone | "auto">("auto");
  const [stage, setStage] = useState<Stage>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<Exporting>({ state: "idle" });
  const abort = useRef<AbortController | null>(null);
  // The current video's recorded voiceover lines, as URLs the preview and exporter play.
  const [voice, setVoice] = useState<{ projectId: string; clips: Record<number, string>; missing: boolean } | null>(null);
  const [mode, setMode] = useState<Mode>("bespoke");
  const host = useRef<FilmHost | null>(null);
  const onHost = useCallback((h: FilmHost | null) => {
    host.current = h;
  }, []);
  const onFilmError = useCallback((m: string) => setError(`The preview hit an error: ${m}`), []);
  const running = useRef<AbortController | null>(null);
  // What a bespoke run is doing right now, and the run second it started (so its own time can show).
  const [activity, setActivity] = useState<{ who: string; text: string; key: string; at: number }[]>([]);
  const runStarted = useRef(0);
  // Screenshots of the real product for a bespoke video, as image data URLs.
  const [refs, setRefs] = useState<string[]>([]);
  // A bespoke video's recorded voice-over lines, by beat.
  const [filmClips, setFilmClips] = useState<{ projectId: string; clips: Record<number, Blob> } | null>(null);
  // A bespoke video's ElevenLabs music bed, when it has one.
  const [filmMusic, setFilmMusic] = useState<{ projectId: string; blob: Blob } | null>(null);
  // The inspector's pane, the scenes picked on the timeline, the video list on small screens, and the preview's playhead.
  const [tab, setTab] = useState<Tab>("improve");
  // Making a new video: the wizard takes the whole workspace until the video exists.
  const [creating, setCreating] = useState(false);
  const [targets, setTargets] = useState<string[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [transport] = useState(createTransport);
  /** The preview's element and the words on its current frame, for the Text tab. */
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameText, setFrameText] = useState("");
  /** Clicking the preview picks text to edit, or points a note at a place. */
  const [pickFor, setPickFor] = useState<"text" | "note" | null>(null);
  const [pin, setPin] = useState<Pin | null>(null);
  const frameNow = useRef(0);
  useEffect(() => transport.subscribe((f) => void (frameNow.current = f)), [transport]);
  const [picked, setPicked] = useState<{ text: string; n: number } | null>(null);
  // The last note's outcome, and where the current film is in its versions.
  const [revision, setRevision] = useState<ImproveResult>(null);
  const [versions, setVersions] = useState<{ projectId: string; canUndo: boolean; canRedo: boolean; label: string | null }>({ projectId: "", canUndo: false, canRedo: false, label: null });

  // Storage is only readable in the browser, after the first render.
  useEffect(() => {
    const s = loadSettings();
    const list = loadProjects();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
    // No run survives a closed app: a film still "building" was interrupted, and keeps what was built until then.
    const fixed = recoverInterrupted(list);
    if (fixed.some((p, i) => p !== list[i])) for (const p of [...fixed].reverse()) if (p.film?.interrupted) saveProject(p);
    setSettings(s);
    setProjects(fixed);
    setCurrent(fixed[0] ?? null);
    setCreating(!fixed.length);
    if (fixed[0]) setFormat(fixed[0].format);
    if (fixed[0]) setTab(fixed[0].film?.modules ? "improve" : fixed[0].plan ? "edit" : "details");
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
    void storedNarration(current.plan, current.voice, lexiconOf(loadSettings(), current)).then((blobs) => {
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

  // What the stage plays before there is a video: OneMotion's own film, a scene in the same kit the designer writes in.
  const [example, setExample] = useState<FilmState | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const ex = (await (await fetch("/api/scene/example?name=onemotion")).json()) as { film: FilmSpec & { score: unknown }; files: Record<string, string> };
        const c = (await (await fetch("/api/scene/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: ex.files }) })).json()) as { ok: boolean; modules: Record<string, string> };
        if (!live || !c.ok) return;
        const concept = normalizeConcept({ title: "OneMotion", language: "id", beats: ex.film.beats, brand: ex.film.brand });
        const spec: FilmSpec = { ...ex.film, score: { ...normalizeScore(ex.film.score, ex.film.beats.length, "corporate-pop", 7), bpm: LIBRARY.find((t) => t.id === ex.film.track)?.bpm ?? 120 } };
        setExample({ concept, spec, files: ex.files, modules: c.modules, status: "done", summary: "", spend: { input: 0, output: 0, cached: 0, usd: 0 }, log: [], reviews: [] });
      } catch {
        // Without it the stage shows the template example.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // Where the film is in its versions, for undo and redo.
  useEffect(() => {
    const id = current?.id;
    if (!id || !current?.film || versions.projectId === id) return;
    let live = true;
    void loadHistory(id).then((h) => {
      if (live) setVersions({ projectId: id, canUndo: h.index > 0, canRedo: h.index < h.versions.length - 1, label: h.versions[h.index]?.label ?? null });
    });
    return () => {
      live = false;
    };
  }, [current, versions.projectId]);

  const mine = voice && current?.voice && voice.projectId === current.id ? voice : null;
  const clips = mine?.clips;
  const input = useMemo(() => (hasPlan(current) ? inputOf({ ...current, format }, clips) : { ...SAMPLE_INPUT, format }), [current, format, clips]);
  const ai = useMemo(() => aiOf(settings), [settings]);
  const ready = Boolean(ai.key && ai.model);
  // The models to choose from: OneAPI's catalog, or the ones the person's endpoint lists.
  const aiModels = useMemo<CatalogModel[]>(
    () => (ai.custom ? (settings.custom?.models ?? []).map((id) => ({ id, name: id, tagline: "", contextWindow: "", capabilities: [], inputPrice: "", outputPrice: "", listInput: "", listOutput: "", currency: "USD", free: false })) : models),
    [ai.custom, settings.custom?.models, models],
  );
  useEffect(() => setEndpoint(ai.endpoint), [ai.endpoint?.base, ai.endpoint?.api, ai.endpoint?.auth]); // eslint-disable-line react-hooks/exhaustive-deps
  // A model whose provider keeps failing hands the step to a backup (OneAPI only: a custom endpoint's models are its own).
  const backup = ai.custom ? null : backupOf(settings, ai.model, aiModels);
  useEffect(() => setBackupModel(backup), [backup]);

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
        const choice = { voiceId: settings.voice.voiceId, voiceName: settings.voice.voiceName, ...(settings.voice.tuning ? { tuning: settings.voice.tuning } : {}) };
        const rec = await recordNarration(project.plan, settings.voice.key, choice, { lexicon: lexiconOf(settings, project) });
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

  /** The website: the one typed in, else one named in the brief, else OneAPI's own. */
  const findSite = useCallback(async (opts: { brief: string; website: string; site?: SiteInfo | null }): Promise<SiteInfo | null> => {
    if (opts.site !== undefined) return opts.site;
    const explicit = opts.website.trim();
    // The website typed in, else one the brief names; a video about no website reads none.
    const target = explicit || findUrl(opts.brief);
    if (!target) return null;
    setStage("site");
    const res = await fetch("/api/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target }) });
    const body = (await res.json()) as { site?: SiteInfo; error?: string };
    if (res.ok && body.site) return body.site;
    if (explicit) throw new Error(body.error ?? "That website could not be opened.");
    return null;
  }, []);

  /** A collaboration's partner, read from its website (once: a project keeps what was read). */
  const findPartner = useCallback(async (p: Partner & { site?: SiteInfo | null }): Promise<NonNullable<Project["partner"]>> => {
    if (p.site !== undefined) return { website: p.website, lead: p.lead, site: p.site };
    setStage("site");
    let read: SiteInfo | null = null;
    let why = "";
    try {
      const res = await fetch("/api/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: siteOf(p.website) }) });
      const body = (await res.json()) as { site?: SiteInfo; error?: string };
      if (res.ok && body.site) read = body.site;
      else why = body.error ?? "";
    } catch (err) {
      why = err instanceof Error ? err.message : String(err);
    }
    const site = partnerInfo(read, p);
    if (!site) throw new Error(`The partner's website (${siteOf(p.website)}) could not be opened${why ? `: ${why}` : ""}. Check the address, or upload the partner's logo.`);
    return { website: p.website, lead: p.lead, site };
  }, []);

  const design = useCallback(
    async (opts: { brief: string; website: string; site?: SiteInfo | null; previous?: Plan; replace?: Project }) => {
      if (!ready) {
        setSettingsOpen(true);
        return;
      }
      setError(null);
      setExporting({ state: "idle" });
      setSeconds(0);
      setCreating(false);
      setTab("edit");
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
          model: ai.model,
          narration: voiceReady(settings),
        };
        const res = await fetch("/api/direct", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...aiHeaders(ai.key) },
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
    [ready, projects, format, tone, settings, ai, recordVoice, findSite],
  );

  /**
   * A bespoke video: the creative director's concept, then the agent writes
   * the scene, rendering and looking at it until it is good. The project is
   * saved after every step, and the preview follows every version that
   * passes the check.
   */
  /** One line per agent working; a new activity restarts its clock, the same one with a new character count keeps it. */
  const track = useCallback((who: string, text: string | null) => {
    const at = Math.round((Date.now() - runStarted.current) / 1000);
    setActivity((all) => {
      const rest = all.filter((a) => a.who !== who);
      if (text === null) return rest;
      const key = text.replace(/\s*\([^)]*\)/g, "");
      const was = all.find((a) => a.who === who);
      return [...rest, was && was.key === key ? { ...was, text } : { who, text, key, at }].sort((a, b) => ORDER(a.who) - ORDER(b.who));
    });
  }, []);

  const makeBespoke = useCallback(
    async (opts: { brief: string; website: string; site?: SiteInfo | null; partner?: (Partner & { site?: SiteInfo | null }) | null; replace?: Project; resume?: { concept: FilmState["concept"]; spec: FilmState["spec"] } }) => {
      if (!ready) {
        setSettingsOpen(true);
        return;
      }
      setError(null);
      setExporting({ state: "idle" });
      setSeconds(0);
      setCreating(false);
      const ctrl = new AbortController();
      running.current = ctrl;
      try {
        const site = await findSite(opts);
        const partner = opts.partner ? await findPartner(opts.partner) : null;
        // The other pages the brief names (pricing, models, docs): their words become facts, their images assets. The partner's site is read as the partner.
        const partnerDomain = partner?.site?.domain;
        const others = findUrls(opts.brief, 5).filter((u) => (!site || !u.replace(/^https?:\/\//, "").startsWith(site.domain) || u.replace(/\/$/, "").split("/").length > 3) && (!partnerDomain || !u.replace(/^https?:\/\/(www\.)?/, "").startsWith(partnerDomain.replace(/^www\./, ""))));
        const pages: SiteInfo[] = [];
        if (others.length) {
          setStage("site");
          const read = await Promise.allSettled(
            others.slice(0, 4).map(async (url) => {
              const res = await fetch("/api/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
              const body = (await res.json()) as { site?: SiteInfo };
              if (!res.ok || !body.site) throw new Error(url);
              return { ...body.site, logo: null };
            }),
          );
          for (const r of read) if (r.status === "fulfilled" && r.value.url !== site?.url) pages.push(r.value);
        }
        setStage("film");
        runStarted.current = Date.now();
        // A brief of the person's own raw notes gets the production brief the wizard's briefs carry (the story, a timed
        // storyboard, motifs, what to avoid, the close), written by their model below their words, which stay as they are.
        let brief = opts.brief;
        if (!opts.resume && needsProductionBrief(brief)) {
          track("brief", "writing the production brief from your brief (your words stay as written)");
          try {
            const idea = { ...ideaFromBrief(brief, opts.website), template: (opts.partner ? "collab" : "custom") as TemplateId, partner: opts.partner ? { website: opts.partner.website, lead: opts.partner.lead } : null };
            const r = await writeBrief({ key: ai.key, model: ai.model, idea, format: formatLine(format), signal: ctrl.signal });
            brief = withProductionBrief(brief, r.brief);
          } catch (err) {
            if (ctrl.signal.aborted) throw err;
            // Without it the film is still made, from the brief as it is.
          } finally {
            track("brief", null);
          }
        }
        const base: Project = { id: opts.replace?.id ?? newId(), createdAt: new Date().toISOString(), brief, website: opts.website, format, tone, site, ...(partner ? { partner } : {}) };
        setCurrent(base);
        const keep = (film: FilmState) => {
          const p = { ...base, film };
          setCurrent(p);
          setProjects(saveProject(p));
        };
        const recent = projects.filter((p) => p.film && p.id !== base.id).slice(0, 4).map((p) => recentFilmOf(p.film as FilmState));
        const film = await makeFilm({
          key: ai.key,
          model: ai.model,
          brief,
          site,
          format,
          models,
          recent,
          refs,
          pages,
          partner: partner?.site ? { site: partner.site, lead: partner.lead } : null,
          resume: opts.resume,
          // Web search is a OneAPI service.
          web: settings.webSearch && !ai.custom,
          team: settings.team,
          host: () => host.current,
          voice: voiceReady(settings) ? { apiKey: settings.voice.key, voiceId: settings.voice.voiceId, voiceName: settings.voice.voiceName, tuning: settings.voice.tuning } : undefined,
          lexicon: lexiconOf(settings, opts.replace),
          music:
            settings.music === "elevenlabs" && settings.voice?.key
              ? { provider: "elevenlabs", key: settings.voice.key }
              : settings.music === "stableaudio" && settings.stableAudio?.token
                ? { provider: "stableaudio", key: settings.stableAudio.token }
                : undefined,
          onVoice: (clips) => setFilmClips({ projectId: base.id, clips }),
          onMusic: (blob) => setFilmMusic({ projectId: base.id, blob }),
          onActivity: track,
          onConcept: keep,
          update: keep,
          signal: ctrl.signal,
        });
        if (film.status === "failed") setError(film.summary);
        else if (film.modules) setTab("improve");
        else setTab("details");
      } catch (err) {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        running.current = null;
        setActivity([]);
        setStage(null);
      }
    },
    [ready, projects, format, tone, settings, ai, models, findSite, findPartner, refs, track],
  );

  /** Saves a film into its project and shows it. */
  const keepFilm = useCallback((project: Project, film: FilmState): Project => {
    const p = { ...project, film };
    setCurrent(p);
    setProjects(saveProject(p));
    return p;
  }, []);

  /** Finds a film's recorded lines again (after an edit re-timed or re-recorded some). */
  const reloadClips = useCallback(async (projectId: string, film: FilmState) => {
    if (!film.voice) return;
    const clips = await storedFilmVoice(film.spec, film.concept.language, film.voice);
    if (clips) setFilmClips({ projectId, clips });
  }, []);

  /** Records a new version of the film and where it now is in its versions. */
  const remember = useCallback(async (projectId: string, film: FilmState, label: string, before: FilmState) => {
    const h = await record(projectId, film, label, before);
    setVersions({ projectId, canUndo: h.index > 0, canRedo: false, label });
  }, []);

  /** "Improve with AI" on a finished film: the note becomes an edit of this film, never a new one. */
  const improveFilm = useCallback(
    async (note: string, locks: Locks, targets: string[], from?: Project) => {
      const project = from ?? current;
      const before = project?.film;
      if (!project || !before || !ready) return null;
      setError(null);
      setRevision(null);
      setExporting({ state: "idle" });
      setSeconds(0);
      const ctrl = new AbortController();
      running.current = ctrl;
      setStage("film");
      runStarted.current = Date.now();
      try {
        const r = await reviseFilm({
          key: ai.key,
          model: ai.model,
          film: before,
          brief: project.brief,
          site: project.site,
          models,
          note,
          locks,
          targets,
          host: () => host.current,
          voice: voiceReady(settings) ? { apiKey: settings.voice.key, voiceId: settings.voice.voiceId, voiceName: settings.voice.voiceName, tuning: settings.voice.tuning } : undefined,
          lexicon: lexiconOf(settings, project),
          onActivity: track,
          update: (film) => keepFilm(project, film),
          signal: ctrl.signal,
        });
        keepFilm(project, r.film);
        if (r.film !== before) await remember(project.id, r.film, note, before);
        setRevision({ summary: r.plan.summary, refused: r.refused, changed: r.changed });
        await reloadClips(project.id, r.film);
        return r.film;
      } catch (err) {
        // Whatever happened, the film the person had stays.
        keepFilm(project, before);
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        running.current = null;
        setActivity([]);
        setStage(null);
      }
    },
    [current, ready, settings, ai, models, track, keepFilm, remember, reloadClips],
  );

  /** An interrupted build, continued: the designer finishes what is unfinished, or the build restarts from the saved concept. */
  async function resumeFilm(project: Project) {
    const f = project.film;
    if (!f) return;
    if (!ready) {
      setSettingsOpen(true);
      return;
    }
    if (!f.modules) {
      await makeBespoke({ brief: project.brief, website: project.website, site: project.site, partner: project.partner, replace: project, resume: { concept: f.concept, spec: f.spec } });
      return;
    }
    const cleared = keepFilm(project, { ...f, interrupted: false });
    await improveFilm(
      "The build was interrupted before it finished. Finish this film as the concept describes: write every scene that is still empty or unfinished, fix what does not play well, keep everything that already works.",
      { narration: true, text: false, structure: true, music: true, visuals: false },
      [],
      cleared,
    );
  }

  /**
   * One piece of on-screen text changed by hand: replaced in the scene's
   * source, checked and compiled (no AI, a few seconds), and kept as the
   * person's own words so later AI edits leave it as typed. A beat that
   * said exactly those words says the new ones.
   */
  async function editScreenText(item: ScreenText, text: string): Promise<string | null> {
    const project = current;
    const before = project?.film;
    if (!project || !before) return "There is no film open.";
    if (stage) return "Wait until the film has finished building.";
    let files: Record<string, string>;
    try {
      files = replaceScreenText(before.files, item, text);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
    try {
      // The person's own words are the facts: a number they type is theirs to show.
      const c = await compile(files, undefined);
      if (!c.ok) return `That text does not fit the scene's code: ${c.errors[0] ?? "the check failed"}. Try other words, or change it with Improve with AI.`;
      const says = <B extends { says: string }>(b: B): B => (b.says === item.text ? { ...b, says: text } : b);
      const film: FilmState = {
        ...before,
        files,
        modules: c.modules,
        spec: { ...before.spec, beats: before.spec.beats.map(says) },
        concept: { ...before.concept, beats: before.concept.beats.map(says) },
        textEdits: addEdit(before.textEdits ?? [], item.text, text),
      };
      keepFilm(project, film);
      await remember(project.id, film, `text: ${text.slice(0, 40)}`, before);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  /** One colour swapped by hand, everywhere the scene uses it: checked and compiled without the AI, and kept by later AI edits. */
  async function editColor(from: string, to: string): Promise<string | null> {
    const project = current;
    const before = project?.film;
    if (!project || !before) return "There is no film open.";
    if (stage) return "Wait until the film has finished building.";
    try {
      const files = recolor(before.files, from, to);
      const c = await compile(files, undefined);
      if (!c.ok) return `That colour could not be applied: ${c.errors[0] ?? "the check failed"}.`;
      const film: FilmState = { ...before, files, modules: c.modules, colorEdits: addColorEdit(before.colorEdits ?? [], from, to) };
      keepFilm(project, film);
      await remember(project.id, film, `colour ${from} to ${to}`, before);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  async function moveVersion(by: -1 | 1) {
    if (!current?.film || stage) return;
    const r = await step(current.id, by);
    if (!r) return;
    keepFilm(current, r.film);
    setVersions({ projectId: current.id, canUndo: r.history.index > 0, canRedo: r.history.index < r.history.versions.length - 1, label: r.history.versions[r.history.index].label });
    setRevision(null);
    setExporting({ state: "idle" });
    await reloadClips(current.id, r.film);
  }

  /**
   * One narration line edited by hand: only it is recorded again, and the
   * film re-times around it. When the scene times a moment on a word the
   * line no longer says, the designer re-times it; a film is never left
   * stopping on such a cue (without the AI, the edit is not made).
   */
  async function editLine(index: number, text: string) {
    const project = current;
    const before = project?.film;
    if (!project || !before || stage) return;
    setError(null);
    let spec = { ...before.spec, beats: before.spec.beats.map((b, k) => (k === index ? unrecorded({ ...b, voice: text }) : b)) };
    const id = spec.beats[index].id;
    const broken = brokenCues(before.files, filmTiming(spec.beats, spec.score).beats);
    if (broken.length && !ready) {
      setError(`The scene times ${broken.length} moment(s) on words this new line does not say (${broken[0]}). Add your OneAPI key so the AI can re-time them; the line was not changed.`);
      return;
    }
    let next: Project | null = null;
    setStage("voice");
    try {
      const choice = before.voice ?? (voiceReady(settings) ? { voiceId: settings.voice.voiceId, voiceName: settings.voice.voiceName, tuning: settings.voice.tuning } : undefined);
      if (voiceReady(settings) && choice) {
        const rec = await recordFilmVoice({ spec, language: before.concept.language, apiKey: settings.voice.key, voice: choice, lexicon: lexiconOf(settings, project), only: [index] });
        spec = rec.spec;
      }
      const film: FilmState = { ...before, spec, voice: choice, concept: { ...before.concept, beats: before.concept.beats.map((b, k) => (k === index ? { ...b, voice: text } : b)) } };
      next = keepFilm(project, film);
      // An export made before this line was recorded is not this video any more.
      setExporting({ state: "idle" });
      if (!broken.length) await remember(project.id, film, `narration of ${id}`, before);
      await reloadClips(project.id, film);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStage(null);
    }
    if (!next || !broken.length) return;
    // Undo after the fix goes back to the film before the edit, never to the half-way one that cannot play.
    if (!(await loadHistory(project.id)).versions.length) await record(project.id, before, "original");
    const fixed = await improveFilm(`The narration of ${id} was edited. Re-time the scene to the new line: every cue on a word must use a word the line now says. Change nothing else.`, { narration: true, text: true, structure: true, music: true, visuals: false }, [id], next);
    if (!fixed || brokenCues(fixed.files, filmTiming(fixed.spec.beats, fixed.spec.score).beats).length) {
      keepFilm(project, before);
      await reloadClips(project.id, before);
      setError("The scene could not be re-timed to the new line, so the line was put back as it was.");
    }
  }

  /** The music changed by hand: the track (the beats snap to its tempo), its level, or none. */
  async function changeMusic(patch: { track?: string; level?: number; off?: boolean; upload?: File }) {
    const project = current;
    const before = project?.film;
    if (!project || !before || stage) return;
    let film: FilmState = before;
    if (patch.track) {
      const t = LIBRARY.find((x) => x.id === patch.track);
      if (!t) return;
      film = { ...film, musicKey: undefined, spec: { ...film.spec, track: t.id, cues: undefined, musicMap: undefined, score: { ...film.spec.score, bpm: t.bpm }, mix: { ...film.spec.mix, trim: undefined } } };
      setFilmMusic(null);
    }
    if (patch.upload) {
      // The person's own track: kept on this device like a made bed, and played instead of the library.
      const key = `film-music|upload|${patch.upload.name.replace(/\|/g, " ")}|${patch.upload.size}`;
      await putLine(key, patch.upload);
      // Tracks from other tools are often mastered far louder than the library: match them first.
      let trim = 1;
      let map: MusicMap;
      try {
        const ctx = new OfflineAudioContext(1, 1, 44100);
        const audio = await ctx.decodeAudioData(await patch.upload.arrayBuffer());
        const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
        trim = matchGain(rmsDb(channels));
        // Its tempo, downbeat and drops: the film's beats snap to it and its close lands on a drop.
        const mono = new Float32Array(channels[0].length);
        for (const c of channels) for (let i = 0; i < mono.length; i++) mono[i] += c[i] / channels.length;
        map = analyzeMusic(mono, audio.sampleRate);
      } catch {
        setError("That audio file could not be read. Try an mp3 or wav.");
        return;
      }
      film = { ...film, musicKey: key, spec: { ...film.spec, musicMap: map, score: { ...film.spec.score, bpm: map.bpm }, mix: { ...film.spec.mix, trim } } };
      setFilmMusic({ projectId: project.id, blob: patch.upload });
    }
    if (patch.level !== undefined || patch.off !== undefined) film = { ...film, spec: { ...film.spec, mix: { ...film.spec.mix, ...(patch.level !== undefined ? { music: patch.level } : {}), ...(patch.off !== undefined ? { off: patch.off } : {}) } } };
    keepFilm(project, film);
    setExporting({ state: "idle" });
    await remember(project.id, film, "music", before);
  }

  function make() {
    if (stage || brief.length > MAX_BRIEF[mode]) return;
    // No brief: a launch promo for the website, or for OneAPI.
    const text = brief.trim();
    // A video is always about something the person named: a brief, and a website (typed in or in the brief).
    if (!text || !(isWebsite(website) || findUrl(text))) {
      setError(!text ? "Write the brief first." : "Add the product's website, or name it in the brief.");
      return;
    }
    if (partner && !isWebsite(partner.website)) {
      setError("Add the partner's website, or remove the partner.");
      return;
    }
    if (mode === "bespoke") void makeBespoke({ brief: text, website, partner });
    else void design({ brief: text, website });
  }

  async function startExport() {
    if (!current) return;
    if (current.film) return exportFilm(current.film);
    if (!hasPlan(current)) return;
    const { checkExport, exportMp4 } = await import("./exporter");
    const { profileOf } = await import("./renderTarget");
    const profile = profileOf(settings.renderProfile);
    const check = await checkExport(format, profile);
    if (!check.ok) {
      setExporting({ state: "failed", message: `This browser cannot export video (${check.reason}). Use Chrome or Edge on a computer, or render with the CLI: npm run render.` });
      return;
    }
    abort.current = new AbortController();
    setExporting({ state: "running", progress: 0 });
    try {
      const signal = abort.current.signal;
      const rendered = await exportMp4(inputOf({ ...current, format }, clips), (p) => setExporting({ state: "running", progress: p * RENDER_SHARE }), signal, check.target, profile);
      const blob = await mastered(rendered, check.target.container, Object.keys(clips ?? {}).length > 0, signal);
      setExporting({ state: "done", url: URL.createObjectURL(blob), name: slug(current.plan.brand || current.brief).replace(/\.mp4$/, `.${check.target.ext}`) });
    } catch (err) {
      setExporting(abort.current.signal.aborted ? { state: "idle" } : { state: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * The rendered file with its sound mastered to the film's loudness: -14 LUFS
   * with a voice, quieter with music alone. Mastering is a finish, not a
   * gate: if it fails, the film as rendered is still the export.
   */
  async function mastered(rendered: Blob, container: "mp4" | "webm", voiced: boolean, signal: AbortSignal): Promise<Blob> {
    try {
      const { masterFilm } = await import("./master");
      const { TARGET_MUSIC, TARGET_VOICED } = await import("@/music/loudness");
      const m = await masterFilm(rendered, container, voiced ? TARGET_VOICED : TARGET_MUSIC, (p) => setExporting({ state: "running", progress: RENDER_SHARE + p * (1 - RENDER_SHARE) }), signal);
      if (!m) return rendered;
      console.info(`[export] mastered: ${m.before.toFixed(1)} -> ${m.after.toFixed(1)} LUFS`);
      return m.blob;
    } catch (err) {
      if (signal.aborted) throw err;
      console.warn("[export] mastering failed; keeping the film as rendered", err);
      return rendered;
    }
  }

  async function exportFilm(film: FilmState) {
    const box = host.current;
    if (!box || !film.modules) return;
    const { pickTarget, profileOf } = await import("./renderTarget");
    const profile = profileOf(settings.renderProfile);
    const { width, height } = DIMENSIONS[film.spec.format];
    const check = await pickTarget(width, height, profile.scale);
    if (!check.ok) {
      setExporting({ state: "failed", message: `This browser cannot export video (${check.reason}). Use Chrome or Edge on a computer.` });
      return;
    }
    abort.current = new AbortController();
    setExporting({ state: "running", progress: 0 });
    try {
      const signal = abort.current.signal;
      const rendered = await box.exportMp4({ spec: film.spec, modules: film.modules, voiceover, music }, (p) => setExporting({ state: "running", progress: p * RENDER_SHARE }), signal, check.target, profile);
      const blob = await mastered(rendered, check.target.container, Object.keys(voiceover ?? {}).length > 0, signal);
      setExporting({ state: "done", url: URL.createObjectURL(blob), name: slug(film.spec.brand.name || film.concept.title).replace(/\.mp4$/, `.${check.target.ext}`) });
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

  const exportControl =
    exporting.state === "running" ? (
      <button type="button" className="btn export-progress" onClick={() => abort.current?.abort()} title="Cancel the export">
        <span className="meter" style={{ ["--p" as string]: `${Math.round(exporting.progress * 100)}%` }} aria-hidden="true" />
        <span className="mono">{Math.round(exporting.progress * 100)}%</span> Cancel
      </button>
    ) : exporting.state === "done" ? (
      <a className="btn primary" href={exporting.url} download={exporting.name}>
        Download {exporting.name.endsWith(".webm") ? "WebM" : "MP4"}
      </a>
    ) : (
      <button type="button" className="btn primary" onClick={startExport} disabled={!current || Boolean(stage) || (isFilm && !film?.modules)}>
        Export
      </button>
    );

  const tabs: { id: Tab; label: string }[] = film?.modules
    ? [
        { id: "improve", label: "Improve" },
        { id: "text", label: "Edit" },
        { id: "narration", label: "Narration" },
        { id: "music", label: "Music" },
        { id: "details", label: "Details" },
      ]
    : plan
      ? [
          { id: "edit", label: "Edit" },
          { id: "details", label: "Details" },
        ]
      : film
        ? [{ id: "details", label: "Details" }]
        : [];
  const shown: Tab | null = tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? null);

  // The Text tab follows the preview: the words on the frame it shows, read after each frame is drawn.
  useEffect(() => {
    if (shown !== "text") return;
    let raf = 0;
    const read = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setFrameText(visibleText(frameRef.current)));
    };
    const off = transport.subscribe(read);
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [shown, transport, film?.modules]);

  // Picking text lasts while the Text tab of a film is open, and ends with Escape.
  const pickingNow = Boolean(film?.modules) && ((pickFor === "text" && shown === "text") || (pickFor === "note" && shown === "improve"));
  useEffect(() => {
    if (!pickingNow) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPickFor(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [pickingNow]);
  const filmBusy = Boolean(stage) || exporting.state === "running";
  const status = film ? (stage === "film" ? "Building" : film.interrupted ? "Interrupted" : film.status === "done" ? "Ready" : film.status === "stopped" ? "Stopped early" : film.status === "failed" ? "Failed" : "Building") : plan ? "Ready" : null;

  return (
    <div className="shell" data-library={libraryOpen ? "open" : undefined} data-mode={creating ? "create" : undefined}>
      <header className="topbar">
        <button type="button" className="icon-btn library-toggle" aria-label="Videos" aria-expanded={libraryOpen} onClick={() => setLibraryOpen((v) => !v)}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
        </button>
        <div className="mark">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="14" />
            <path d="M16 46V18l16 18 16-18v28" />
          </svg>
          <span className="wordmark">OneMotion</span>
        </div>
        <div className="crumb">
          {current && !creating ? (
            <>
              <span className="crumb-title">{film?.concept.title || titleOf(current)}</span>
              {status ? (
                <span className="pill" data-tone={status === "Ready" ? "ok" : status === "Failed" ? "bad" : status === "Building" ? "live" : undefined}>
                  {status === "Building" ? <span className="pulse" aria-hidden="true" /> : null}
                  {status}
                </span>
              ) : null}
            </>
          ) : (
            <span className="crumb-title muted">New video</span>
          )}
        </div>
        <div className="topbar-actions">
          {film?.modules ? (
            <div className="history" role="group" aria-label="History">
              <button type="button" className="icon-btn" aria-label="Undo" title={versions.label ? `Undo: ${versions.label}` : "Undo"} disabled={filmBusy || !(versions.projectId === current?.id && versions.canUndo)} onClick={() => void moveVersion(-1)}>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M8 5 4 9l4 4M4 9h8a4 4 0 0 1 0 8h-2" />
                </svg>
              </button>
              <button type="button" className="icon-btn" aria-label="Redo" disabled={filmBusy || !(versions.projectId === current?.id && versions.canRedo)} onClick={() => void moveVersion(1)}>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m12 5 4 4-4 4M16 9H8a4 4 0 0 0 0 8h2" />
                </svg>
              </button>
            </div>
          ) : null}
          <button type="button" className="icon-btn" aria-label="Settings" title="Settings" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="2.6" />
              <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
            </svg>
          </button>
          <button type="button" className="model-chip" data-ready={ready || undefined} onClick={() => setSettingsOpen(true)} title="Settings" aria-label={ready ? `Settings (${ai.name}, model ${ai.model})` : "Settings: add your API key"}>
            <span className={ready ? "dot ok" : "dot"} aria-hidden="true" />
            <span className="model-name">{ready ? `${ai.custom ? `${ai.name} · ` : ""}${ai.model}` : ai.custom ? "Finish your endpoint" : "Add your OneAPI key"}</span>
          </button>
          {exportControl}
        </div>
      </header>

      <aside className="library" aria-label="Your videos">
        <div className="library-head">
          <h2>Videos</h2>
          <button
            type="button"
            className="btn small"
            disabled={Boolean(stage)}
            onClick={() => {
              setCreating(true);
              setBrief("");
              setExporting({ state: "idle" });
              setLibraryOpen(false);
            }}
          >
            New
          </button>
        </div>
        {projects.length ? (
          <ul className="library-list">
            {projects.map((p) => (
              <li key={p.id} aria-current={p.id === current?.id && !creating ? "true" : undefined}>
                <button
                  type="button"
                  className="library-item"
                  disabled={Boolean(stage)}
                  onClick={() => {
                    setCurrent(p);
                    setFormat(p.format);
                    setExporting({ state: "idle" });
                    setTargets([]);
                    setTab(p.film?.modules ? "improve" : p.plan ? "edit" : "details");
                    setCreating(false);
                    setLibraryOpen(false);
                  }}
                >
                  <span className={`thumb thumb-${p.format}`} aria-hidden="true" />
                  <span className="library-text">
                    <strong>{titleOf(p)}</strong>
                    <span>{p.film ? `Bespoke · ${Math.round(filmTiming(p.film.spec.beats, p.film.spec.score).timing.total / 30)}s` : p.plan ? `Quick · ${p.format}` : p.format}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label={`Delete ${titleOf(p)}`}
                  title="Delete"
                  disabled={Boolean(stage)}
                  onClick={() => {
                    const list = deleteProject(p.id);
                    setProjects(list);
                    if (current?.id === p.id) setCurrent(list[0] ?? null);
                    if (!list.length) setCreating(true);
                  }}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M5 6h10M8 6V4h4v2M6.5 6l.7 10h5.6l.7-10" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="library-empty">Videos you make appear here. They are kept on this device only.</p>
        )}
        <p className="library-foot">Kept on this device only.</p>
      </aside>

      {creating ? (
        <main className="create-stage" aria-label="Make a video">
      <CreateWizard
        hero={example ? <FilmStage film={example} format="landscape" onHost={ignoreHost} onError={ignoreError} /> : null}
        onCancel={current ? () => setCreating(false) : undefined}
        models={aiModels}
        model={ai.model}
        hasKey={Boolean(ai.key)}
        onModel={(id) => {
          const next = ai.custom && settings.custom ? { ...settings, custom: { ...settings.custom, model: id } } : { ...settings, model: id };
          saveSettings(next);
          setSettings(next);
        }}
        onSettings={() => setSettingsOpen(true)}
        busy={Boolean(stage)}
        ready={ready}
        ai={ready ? { key: ai.key, model: ai.model } : null}
        website={website}
        onWebsite={setWebsite}
        partner={partner}
        onPartner={setPartner}
        format={format}
        onFormat={setFormat}
        mode={mode}
        onMode={setMode}
        tone={tone}
        onTone={setTone}
        refs={refs}
        onRefs={setRefs}
        maxRefs={MAX_REFS}
        brief={brief}
        onBrief={setBrief}
        maxBrief={MAX_BRIEF[mode]}
        onMake={make}
        running={
          stage === "site" ? (
            <>
              Reading the website <span className="mono">{seconds}s</span>
            </>
          ) : stage === "design" ? (
            <>
              Designing <span className="mono">{seconds}s</span>
            </>
          ) : stage === "voice" ? (
            <>
              Recording the voice <span className="mono">{seconds}s</span>
            </>
          ) : stage === "film" ? (
            <>
              {film ? "Building" : "Writing the concept"} <span className="mono">{seconds}s</span>
            </>
          ) : null
        }
        onStop={stage === "film" ? () => running.current?.abort() : undefined}
      />
        </main>
      ) : (
        <>
      <main className="stage-col" aria-label="Preview">
        {error ? (
          <p className="notice" role="alert">
            <span>{error}</span>
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setError(null)}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
          </p>
        ) : null}
        {exporting.state === "failed" ? (
          <p className="notice" role="alert">
            <span>{exporting.message}</span>
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setExporting({ state: "idle" })}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
          </p>
        ) : null}
        {film?.interrupted && current && !stage ? (
          <div className="resume" role="status">
            <div>
              <strong>This video was interrupted while it was being built.</strong>
              <span>{film.modules ? "Everything up to the last working version is saved. Continue to finish the scenes that are still empty or unfinished." : "Its concept is saved. Continue to build it from that concept; the art director is not asked again."}</span>
            </div>
            <div className="resume-actions">
              <button type="button" className="btn primary" disabled={!ready} onClick={() => void resumeFilm(current)}>
                Continue building
              </button>
              <button type="button" className="btn" disabled={!ready} onClick={() => void makeBespoke({ brief: current.brief, website: current.website, site: current.site, partner: current.partner, replace: current })}>
                Start over
              </button>
            </div>
          </div>
        ) : null}
        <div className={`canvas canvas-${isFilm && film ? film.spec.format : !current && example ? example.spec.format : format}`}>
          <div className="frame">
            {isFilm || (!current && example) ? (
              <FilmStage
                film={isFilm ? film : example}
                format={format}
                voiceover={isFilm ? voiceover : undefined}
                music={isFilm ? music : undefined}
                onHost={onHost}
                onError={onFilmError}
                transport={transport}
                frameRef={frameRef}
                picking={isFilm && pickingNow}
                onPick={(words, at) => {
                  const mode = pickFor;
                  setPickFor(null);
                  if (mode === "note" && film) {
                    const frame = frameNow.current;
                    const beat = filmTiming(film.spec.beats, film.spec.score).beats.find((b) => frame >= b.start && frame < b.end)?.id ?? null;
                    setPin({ frame, x: at.x, y: at.y, beat, words });
                    if (beat && !targets.length) setTargets([beat]);
                  } else {
                    setPicked({ text: words, n: Date.now() });
                    setTab("text");
                  }
                }}
                pin={isFilm && shown === "improve" ? pin : null}
              />
            ) : (
              <Preview input={input} />
            )}
          </div>
        </div>
        {!current ? <p className="canvas-note">What OneMotion is, told as a OneMotion film. Your video plays here.</p> : null}
        {film?.modules ? <Timeline spec={film.spec} transport={transport} selected={targets} onSelect={setTargets} /> : !current && example ? <Timeline spec={example.spec} transport={transport} selected={[]} onSelect={() => undefined} /> : null}
        {stage === "site" || stage === "film" ? (
          <BuildProgress
            stage={stage}
            hasFilm={Boolean(film)}
            log={film?.log.length ? film.log : activity.map((a) => ({ kind: "tool" as const, text: a.text }))}
            seconds={seconds}
            finished={false}
            onShowLog={film ? () => setTab("details") : undefined}
          />
        ) : null}
        {stage === "film" && activity.length ? (
          <ul className="console" role="status" aria-label="What each agent is doing now">
            {activity.map((a) => (
              <li key={a.who}>
                <span className="pulse" aria-hidden="true" />
                <span className="console-who">{WHO[a.who] ?? a.who}</span>
                <span className="console-text">{a.text}</span>
                <span className="console-time mono">{Math.max(0, seconds - a.at)}s</span>
              </li>
            ))}
          </ul>
        ) : null}
      </main>

      <aside className="inspector" aria-label="Inspector">
        {tabs.length ? (
          <div className="tabs" role="tablist" aria-label="Inspector">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={shown === t.id} aria-controls="inspector-panel" onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="inspector-body" id="inspector-panel" role="tabpanel" aria-labelledby={`tab-${shown}`}>
          {shown === "improve" && film && current ? (
            <ImprovePane
              film={film}
              busy={filmBusy}
              ready={ready}
              targets={targets}
              onTargets={setTargets}
              result={revision}
              onImprove={(note, locks, ids) => {
                void improveFilm(pinnedNote(note, pin, FILM_FPS), locks, ids).then((f) => f && setPin(null));
              }}
              pin={pin}
              pointing={pickingNow && pickFor === "note"}
              onPointing={(on) => setPickFor(on ? "note" : null)}
              onUnpin={() => setPin(null)}
            />
          ) : shown === "text" && film && current ? (
            <TextPane film={film} busy={filmBusy} frameText={frameText} picking={pickingNow} onPicking={(on) => setPickFor(on ? "text" : null)} picked={picked} onSave={editScreenText} onColor={editColor} />
          ) : shown === "narration" && film && current ? (
            <NarrationPane
              film={film}
              busy={filmBusy}
              canVoice={voiceReady(settings)}
              language={film.concept.language}
              lexicon={lexiconOf(settings, current)}
              projectLexicon={current.pronunciations ?? []}
              clips={voiceover}
              onLine={(i, text) => void editLine(i, text)}
              onProjectLexicon={(list: Pronunciation[]) => {
                const p = { ...current, pronunciations: list };
                setCurrent(p);
                setProjects(saveProject(p));
              }}
            />
          ) : shown === "music" && film ? (
            <MusicPane film={film} busy={filmBusy} onMusic={(patch) => void changeMusic(patch)} />
          ) : shown === "details" && current && film ? (
            <div className="pane">
              <div className="pane-intro">
                <h3>{film.concept.title || titleOf(current)}</h3>
                {film.concept.angle ? <p>{film.concept.angle}</p> : null}
              </div>
              <dl className="props">
                <dt>Look</dt>
                <dd>{film.concept.style || "—"}</dd>
                <dt>Music</dt>
                <dd>{film.spec.mix?.off ? "Off" : film.musicKey ? (uploadName(film.musicKey) ? `Your track: ${uploadName(film.musicKey)}` : "ElevenLabs, made for this video") : film.spec.track ? (LIBRARY.find((x) => x.id === film.spec.track)?.title ?? film.spec.track) : `${film.spec.score.genre}, composed`}</dd>
                <dt>Length</dt>
                <dd className="mono">{Math.round(filmTiming(film.spec.beats, film.spec.score).timing.total / 30)}s · {film.spec.beats.length} scenes</dd>
                <dt>Review</dt>
                <dd>{film.reviews?.length ? `Art director ${film.reviews[film.reviews.length - 1].score}/10` : "—"}</dd>
                <dt>Spend</dt>
                <dd className="mono">{film.spend.usd ? `$${film.spend.usd.toFixed(2)}` : `${Math.round((film.spend.input + film.spend.output) / 1000)}k tokens`}</dd>
              </dl>
              {current.brief ? (
                <details className="disclosure">
                  <summary>Brief</summary>
                  <p className="brief-text">{current.brief}</p>
                </details>
              ) : null}
              <button type="button" className="btn block" disabled={filmBusy} onClick={() => void makeBespoke({ brief: current.brief, website: current.website, site: current.site, partner: current.partner })}>
                Make another take
              </button>
              {film.log.length ? (
                <details className="disclosure" open={stage === "film"}>
                  <summary>Activity log</summary>
                  <ol className="agent-log" aria-label="What the AI did">
                    {film.log
                      .slice(-80)
                      .reverse()
                      .map((e, i) => (
                        <li key={film.log.length - i} className={`log-${e.kind}`}>
                          {e.text}
                        </li>
                      ))}
                  </ol>
                </details>
              ) : null}
            </div>
          ) : shown === "edit" && hasPlan(current) && plan ? (
            <div className="pane">
              <div className="pane-intro">
                <h3>{plan.brand || current.site?.name || "Your video"}</h3>
                <p>{plan.angle}</p>
              </div>
              {hasNarration(plan) && (!current.voice || mine?.missing) && voiceReady(settings) ? (
                <button type="button" className="btn block" disabled={Boolean(stage)} onClick={() => void recordVoice(current)}>
                  Record the voiceover ({settings.voice.voiceName})
                </button>
              ) : null}
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
            </div>
          ) : shown === "details" && hasPlan(current) && plan ? (
            <div className="pane">
              <dl className="props">
                <dt>Kind</dt>
                <dd>{ARCHETYPE[plan.archetype]}</dd>
                <dt>Room</dt>
                <dd>{plan.look}</dd>
                <dt>Camera</dt>
                <dd>{plan.path}</dd>
                <dt>Music</dt>
                <dd>{scoreOf(plan).genre}</dd>
                <dt>Voice</dt>
                <dd>{clips && current.voice ? current.voice.voiceName : "—"}</dd>
                <dt>Length</dt>
                <dd className="mono">{length}s</dd>
              </dl>
              <button type="button" className="btn block" disabled={Boolean(stage) || exporting.state === "running"} onClick={() => void design({ brief: current.brief, website: current.website, site: current.site, previous: current.plan })}>
                Make another take
              </button>
              <button
                type="button"
                className="btn ghost block"
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
          ) : null}
        </div>
      </aside>

        </>
      )}

      <SettingsView
        open={settingsOpen}
        settings={settings}
        models={models}
        onSave={(s) => {
          saveSettings(s);
          setSettings(s);
          setSettingsOpen(false);
        }}
        onClose={() => setSettingsOpen(false)}
      />

      {libraryOpen ? <button type="button" className="scrim" aria-label="Close the video list" onClick={() => setLibraryOpen(false)} /> : null}

    </div>
  );
}
