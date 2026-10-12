"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { findUrl, mentions } from "@/director/facts";
import type { CatalogModel, DirectInput, Recent, SiteInfo } from "@/director/input";
import type { MotionFormat, Plan, Tone, VideoInput } from "@/engine/plan";
import { SAMPLE_INPUT } from "@/engine/sample";
import { planTiming } from "@/engine/rig";
import { Editor } from "./Editor";
import { SettingsDialog } from "./Settings";
import { deleteProject, loadProjects, loadSettings, newId, saveProject, saveSettings, type Project, type Settings } from "./store";

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

type Stage = "site" | "design" | null;
type Exporting = { state: "idle" } | { state: "running"; progress: number } | { state: "done"; url: string; name: string } | { state: "failed"; message: string };

const recentOf = (p: Plan): Recent => ({ look: p.look, path: p.path, music: p.music, angle: p.angle, tone: p.tone, scenes: p.scenes.map((s) => s.type) });

function inputOf(project: Project): VideoInput {
  return {
    plan: project.plan,
    format: project.format,
    brand: { name: project.site?.name || project.plan.brand, domain: project.site?.domain ?? "", logo_src: project.site?.logo ?? null },
    shots: [],
  };
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

  const input = useMemo(() => (current ? inputOf({ ...current, format }) : { ...SAMPLE_INPUT, format }), [current, format]);
  const ready = Boolean(settings.key && settings.model);

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
        // The website: the one typed in, else one named in the brief, else
        // OneAPI's own when the brief is about it.
        let site = opts.site ?? null;
        if (site === null && opts.site === undefined) {
          const explicit = opts.website.trim();
          const target = explicit || findUrl(opts.brief) || (mentions(opts.brief, "oneapi") ? "oneapi.id" : "");
          if (target) {
            setStage("site");
            const res = await fetch("/api/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target }) });
            const body = (await res.json()) as { site?: SiteInfo; error?: string };
            if (res.ok && body.site) site = body.site;
            else if (explicit) throw new Error(body.error ?? "That website could not be opened.");
          }
        }
        setStage("design");
        const recent = projects.filter((p) => p.id !== opts.replace?.id).slice(0, 3).map((p) => recentOf(p.plan));
        const payload: Partial<DirectInput> & { model: string } = {
          prompt: opts.brief,
          format,
          tone,
          // The logo is for the picture, not for the director.
          site: site ? { ...site, logo: null } : null,
          previous: opts.previous ? recentOf(opts.previous) : undefined,
          recent,
          model: settings.model,
        };
        const res = await fetch("/api/direct", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-OneAPI-Key": settings.key },
          body: JSON.stringify(payload),
        });
        const body = (await res.json()) as { plan?: Plan; error?: string };
        if (!res.ok || !body.plan) throw new Error(body.error ?? "The video could not be designed. Try again.");
        const project: Project = {
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
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setStage(null);
      }
    },
    [ready, projects, format, tone, settings],
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (stage || (!brief.trim() && !website.trim())) return;
    void design({ brief: brief.trim(), website });
  }

  async function startExport() {
    if (!current) return;
    const { checkExport, exportMp4 } = await import("./exporter");
    const check = await checkExport(format);
    if (!check.ok) {
      setExporting({ state: "failed", message: `This browser cannot export video (${check.reason}). Use Chrome or Edge on a computer, or render with the CLI: npm run render.` });
      return;
    }
    abort.current = new AbortController();
    setExporting({ state: "running", progress: 0 });
    try {
      const blob = await exportMp4(inputOf({ ...current, format }), (p) => setExporting({ state: "running", progress: p }), abort.current.signal);
      setExporting({ state: "done", url: URL.createObjectURL(blob), name: slug(current.plan.brand || current.brief) });
    } catch (err) {
      setExporting(abort.current.signal.aborted ? { state: "idle" } : { state: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const plan = current?.plan ?? null;
  const length = plan ? Math.round(planTiming(plan).total / 30) : 0;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="wordmark">Motion</span>
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
            A promo, an announcement, a tutorial or a comparison, in any language. An AI director writes it, picks the scenes, the room, the
            camera and the music; your browser renders the MP4.
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
            <div className="row wrap">
              <div className="seg" role="radiogroup" aria-label="Video size">
                {FORMATS.map((f) => (
                  <button key={f.id} type="button" role="radio" aria-checked={format === f.id} title={f.hint} onClick={() => setFormat(f.id)}>
                    {f.label}
                  </button>
                ))}
              </div>
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
            </div>
            <button type="submit" className="btn primary big" disabled={Boolean(stage) || (!brief.trim() && !website.trim())}>
              {stage === "site" ? `Reading the website… ${seconds}s` : stage === "design" ? `Designing… ${seconds}s` : "Make the video"}
            </button>
            {!ready ? <p className="hint">You need a OneAPI API key first. Designing a video costs one chat request on your key.</p> : null}
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
                      onClick={() => {
                        setCurrent(p);
                        setFormat(p.format);
                        setEditing(false);
                        setExporting({ state: "idle" });
                      }}
                    >
                      <strong>{p.plan.brand || p.site?.name || "Video"}</strong>
                      <span>{p.brief || p.website}</span>
                    </button>
                    <button type="button" className="btn ghost small" aria-label={`Delete ${p.plan.brand || "video"}`} onClick={() => {
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
            <Preview input={input} />
          </div>
          {plan && current ? (
            <div className="meta">
              <div>
                <h2>{plan.brand || current.site?.name || "Your video"}</h2>
                {current.brief ? <p className="brief">{current.brief}</p> : null}
                <p className="angle">{plan.angle}</p>
                <p className="facts">
                  {[ARCHETYPE[plan.archetype], `${plan.look} room`, `${plan.path} camera`, `${plan.music} music`, `${length}s`].join("  ·  ")}
                </p>
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
