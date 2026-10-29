"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogModel } from "@/director/input";
import { addLibraryVoice, libraryVoices, listVoices, speak, type LibraryVoice, type Voice, type VoiceTuning } from "@/voice/eleven";
import { spoken } from "@/voice/spoken";
import { LIBRARY } from "@/music/library";
import { tokenLeft } from "@/music/stable";
import { PronunciationEditor } from "./Pronunciations";
import { PROFILES } from "./renderTarget";
import { backupOf, changeFolder, IMAGE_DEFAULTS, storageInfo, studioLexicon, type CustomEndpoint, type ImageSettings, type Settings } from "./store";
import { MAX_PICTURES } from "@/bespoke/agent/imageTool";



/**
 * Settings, as a modal dialog with sections: the AI the studio runs on (OneAPI, or
 * the person's own endpoint found from its base URL), the voice, the
 * pronunciations and the export. Changes are a draft until Save; Cancel,
 * Escape and the close button leave everything as it was. Keys
 * stay on this device: the AI key travels only with each request, the
 * ElevenLabs key only to ElevenLabs.
 */

type Section = "ai" | "voice" | "pronunciation" | "export" | "storage";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "ai", label: "AI provider" },
  { id: "voice", label: "Voice and music" },
  { id: "pronunciation", label: "Pronunciation" },
  { id: "export", label: "Export" },
  { id: "storage", label: "Storage" },
];

const API_LABEL: Record<CustomEndpoint["api"], string> = { chat: "OpenAI Chat Completions", responses: "OpenAI Responses", messages: "Anthropic Messages" };

const EMPTY_CUSTOM: CustomEndpoint = { base: "", key: "", api: "chat", auth: "bearer", model: "", models: [] };

export function SettingsView({ open, settings: saved, models, onSave, onClose }: { open: boolean; settings: Settings; models: CatalogModel[]; onSave: (s: Settings) => void; onClose: () => void }) {
  const [section, setSection] = useState<Section>("ai");
  const ref = useRef<HTMLDialogElement>(null);
  // What is being edited: a copy of the saved settings, taken each time the dialog opens.
  const [settings, setDraft] = useState<Settings>(saved);
  const set = (patch: Partial<Settings>) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  // A native modal: Escape closes it, focus stays inside, the page behind is inert.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setDraft(saved);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, saved]);
  return (
    <dialog ref={ref} className="settings-dialog" aria-labelledby="settings-title" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <header className="settings-head">
        <div>
          <h2 id="settings-title">Settings</h2>
          <p>Keys stay on this device.</p>
        </div>
        <button type="button" className="icon-btn" aria-label="Close settings" onClick={onClose}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      </header>
      <div className="settings">
      <nav className="settings-nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={section === s.id} aria-controls="settings-panel" onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </nav>
      <div className="settings-body" id="settings-panel" role="tabpanel">
        {section === "ai" ? (
          <AiSection settings={settings} models={models} set={set} />
        ) : section === "voice" ? (
          <VoiceSection settings={settings} set={set} />
        ) : section === "pronunciation" ? (
          <section className="settings-card">
            <h2>Pronunciation</h2>
            <PronunciationEditor
              value={studioLexicon(settings)}
              onChange={(list) => set({ pronunciations: list })}
              hint="How the voice says names, domains and acronyms in every video. The text on screen and in captions stays as written; only what the voice is sent changes. A term in capitals (AI) matches only in capitals. Changing a pronunciation re-records only the lines that use it."
            />
          </section>
        ) : section === "storage" ? (
          <StorageSection />
        ) : (
          <section className="settings-card">
            <h2>Export</h2>
            <div className="choices" role="radiogroup" aria-label="Export quality">
              {PROFILES.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={(settings.renderProfile ?? "balanced") === p.id} className="choice" onClick={() => set({ renderProfile: p.id })}>
                  <strong>{p.label}</strong>
                  <span>{p.about}</span>
                </button>
              ))}
            </div>
            <p className="hint">Videos render on this computer. Higher profiles take longer and use more memory; when this computer cannot encode a size, the export says so before it starts. Without an AAC encoder (Windows N), videos are saved as WebM.</p>
          </section>
        )}
      </div>
      </div>
      <footer className="settings-foot">
        <span className={dirty ? "settings-state dirty" : "settings-state"} aria-live="polite">
          {dirty ? "Unsaved changes" : "No changes"}
        </span>
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!dirty} onClick={() => onSave(settings)}>
          Save
        </button>
      </footer>
    </dialog>
  );
}

/** The model a step goes to when the chosen one's provider keeps failing: automatic (closest in price), a pick, or off. */
function BackupField({ settings, models, chatModels, set }: { settings: Settings; models: CatalogModel[]; chatModels: CatalogModel[]; set: (p: Partial<Settings>) => void }) {
  const auto = backupOf({}, settings.model, models);
  const name = (id: string | null) => (id ? (models.find((m) => m.id === id)?.name ?? id) : "none");
  return (
    <label className="field">
      <span>If the model keeps failing</span>
      <select value={settings.backupModel ?? ""} onChange={(e) => set({ backupModel: e.target.value || undefined })}>
        <option value="">Switch to the closest model in price ({name(auto)})</option>
        <option value="none">Stop and show the error</option>
        {chatModels
          .filter((m) => m.id !== settings.model)
          .map((m) => (
            <option key={m.id} value={m.id}>
              Switch to {m.name || m.id}
            </option>
          ))}
      </select>
      <small className="hint">Only after three failed tries for a reason that passes (its provider down, timing out or rate limited), and only for that step. The log says when it happens.</small>
    </label>
  );
}

/** Where the projects and settings are kept. Acts at once: the page reloads onto the new folder. */
function StorageSection() {
  const info = storageInfo();
  const [dir, setDir] = useState(info.folder ?? "");
  const [copy, setCopy] = useState(true);
  const [state, setState] = useState<{ busy: boolean; error: string }>({ busy: false, error: "" });
  const move = async () => {
    setState({ busy: true, error: "" });
    try {
      await changeFolder(dir, copy);
      window.location.reload();
    } catch (err) {
      setState({ busy: false, error: err instanceof Error ? err.message : "Could not use that folder." });
    }
  };
  if (!info.folder)
    return (
      <section className="settings-card">
        <h2>Storage</h2>
        <p className="hint">Projects and settings are kept in this browser. The desktop app and a studio started on this computer keep them in a folder instead.</p>
      </section>
    );
  return (
    <section className="settings-card">
      <h2>Storage</h2>
      <label className="field">
        <span>Projects folder</span>
        <input type="text" spellCheck={false} value={dir} onChange={(e) => setDir(e.target.value)} />
        <small className="hint">Every project is a file in the <em>projects</em> folder inside it. The desktop app and `npm start` use this same folder, so both show the same projects.</small>
      </label>
      <label className="switch">
        <input type="checkbox" role="switch" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
        <span>Copy my current projects into it</span>
      </label>
      <div>
        <button type="button" className="btn" onClick={() => void move()} disabled={state.busy || !dir.trim() || dir.trim() === info.folder}>
          {state.busy ? "Moving…" : "Use this folder"}
        </button>
      </div>
      {state.error ? <p className="hint" role="alert">{state.error}</p> : null}
      {info.error ? <p className="hint" role="alert">The last save did not reach the folder ({info.error}). It is tried again.</p> : null}
      <p className="hint">Settings, including your API keys, are kept apart in your user folder (<em>.onemotion</em>), not in the projects folder, so a backup or a synced folder does not carry them.</p>
    </section>
  );
}

function AiSection({ settings, models, set }: { settings: Settings; models: CatalogModel[]; set: (p: Partial<Settings>) => void }) {
  const provider = settings.provider ?? "oneapi";
  const custom = settings.custom ?? EMPTY_CUSTOM;
  const setCustom = (patch: Partial<CustomEndpoint>) => set({ custom: { ...custom, ...patch } });
  const [detecting, setDetecting] = useState<{ busy: boolean; error: string | null; note: string | null; warning?: string }>({ busy: false, error: null, note: null });
  const chatModels = models.filter((m) => m.capabilities.includes("Chat") || m.capabilities.length === 0);

  async function detect() {
    setDetecting({ busy: true, error: null, note: null });
    try {
      const res = await fetch("/api/provider/detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base: custom.base, key: custom.key }) });
      const body = (await res.json()) as { base?: string; api?: CustomEndpoint["api"]; auth?: CustomEndpoint["auth"]; models?: string[]; warning?: string; error?: string };
      if (!res.ok || !body.base || !body.api) throw new Error(body.error ?? "The endpoint could not be checked.");
      const ms = body.models ?? [];
      setCustom({ base: body.base, api: body.api, auth: body.auth ?? "bearer", models: ms, model: ms.includes(custom.model) ? custom.model : (ms[0] ?? "") });
      setDetecting({ busy: false, error: null, note: `Found: ${API_LABEL[body.api]} · ${ms.length} model${ms.length === 1 ? "" : "s"} · ${body.base}`, warning: body.warning });
    } catch (err) {
      setDetecting({ busy: false, error: err instanceof Error ? err.message : String(err), note: null });
    }
  }

  return (
    <>
      <section className="settings-card">
        <h2>AI provider</h2>
        <p className="hint">The art director, the motion designer and the editor run on this. Calls are billed to the key you use here.</p>
        <div className="choices" role="radiogroup" aria-label="AI provider">
          <button type="button" role="radio" aria-checked={provider === "oneapi"} className="choice" onClick={() => set({ provider: "oneapi" })}>
            <strong>
              OneAPI <span className="choice-note">recommended</span>
            </strong>
            <span>Every major model with one key, real prices in the studio, and web search for the agents.</span>
          </button>
          <button type="button" role="radio" aria-checked={provider === "custom"} className="choice" onClick={() => set({ provider: "custom" })}>
            <strong>Your own endpoint</strong>
            <span>Any OpenAI-compatible or Anthropic-compatible API with your own key: enter its base URL.</span>
          </button>
        </div>
      </section>

      {provider === "oneapi" ? (
        <section className="settings-card">
          <h3>OneAPI</h3>
          <label className="field">
            <span>API key</span>
            <input type="password" autoComplete="off" spellCheck={false} value={settings.key} onChange={(e) => set({ key: e.target.value.trim() })} placeholder="sk-..." />
            <small className="hint">
              No key yet? Create one at{" "}
              <a href="https://oneapi.id/api-keys" target="_blank" rel="noreferrer">
                oneapi.id
              </a>
              .
            </small>
          </label>
          <label className="field">
            <span>Model</span>
            {chatModels.length ? (
              <select value={settings.model} onChange={(e) => set({ model: e.target.value })}>
                <option value="">Choose a model</option>
                {chatModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id}
                    {m.inputPrice ? `  ·  $${Number(m.inputPrice)} / $${Number(m.outputPrice)} per 1M tokens` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input type="text" spellCheck={false} value={settings.model} onChange={(e) => set({ model: e.target.value.trim() })} placeholder="Model id" />
            )}
            <small className="hint">Bespoke videos need a model that reads images and calls tools; a stronger model makes better films.</small>
          </label>
          {chatModels.length ? <BackupField settings={settings} models={models} chatModels={chatModels} set={set} /> : null}
          <label className="switch">
            <input type="checkbox" role="switch" checked={settings.webSearch ?? false} onChange={(e) => set({ webSearch: e.target.checked })} />
            <span>Let the agents search the web while they design</span>
          </label>
          <p className="hint">OneAPI web search: prices, docs, real logos. $0.005 per search and $0.0001 per page read, at most 5 searches per step.</p>
        </section>
      ) : (
        <section className="settings-card">
          <h3>Your endpoint</h3>
          <label className="field">
            <span>Base URL</span>
            <input type="url" spellCheck={false} value={custom.base} onChange={(e) => setCustom({ base: e.target.value.trim() })} placeholder="https://openrouter.ai/api/v1" />
            <small className="hint">The address before /chat/completions, /responses, /messages and /models. Without /v1, /v1 is tried too.</small>
          </label>
          <label className="field">
            <span>API key</span>
            <input type="password" autoComplete="off" spellCheck={false} value={custom.key} onChange={(e) => setCustom({ key: e.target.value.trim() })} placeholder="Your key for this endpoint" />
          </label>
          <div className="assist">
            <button type="button" className="btn" onClick={() => void detect()} disabled={detecting.busy || !custom.base || !custom.key}>
              {detecting.busy ? "Checking the endpoint…" : "Detect API and models"}
            </button>
            <small className={detecting.error ? "error" : "hint"}>{detecting.error ?? detecting.note ?? "Reads its model list and finds which API it speaks with one tiny request (a few tokens on your key)."}</small>
            {detecting.warning ? <small className="warn">{detecting.warning}</small> : null}
          </div>
          <div className="pair">
            <label className="field">
              <span>API</span>
              <select value={custom.api} onChange={(e) => setCustom({ api: e.target.value as CustomEndpoint["api"], ...(e.target.value === "messages" ? { auth: "x-api-key" as const } : {}) })}>
                {(Object.keys(API_LABEL) as CustomEndpoint["api"][]).map((k) => (
                  <option key={k} value={k}>
                    {API_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Key sent as</span>
              <select value={custom.auth} onChange={(e) => setCustom({ auth: e.target.value as CustomEndpoint["auth"] })}>
                <option value="bearer">Authorization: Bearer</option>
                <option value="x-api-key">x-api-key</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Model</span>
            {custom.models.length ? (
              <select value={custom.model} onChange={(e) => setCustom({ model: e.target.value })}>
                {!custom.model ? <option value="">Choose a model</option> : null}
                {custom.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input type="text" spellCheck={false} value={custom.model} onChange={(e) => setCustom({ model: e.target.value.trim() })} placeholder="Model id, or detect to list them" />
            )}
          </label>
          <p className="hint">With your own endpoint, web search is off and the studio shows tokens instead of prices. On the desktop app the endpoint may be on this computer (a local model server); on the web it must be a public address.</p>
        </section>
      )}

      <section className="settings-card">
        <h3>How the film is built</h3>
        <label className="switch">
          <input type="checkbox" role="switch" checked={settings.team ?? false} onChange={(e) => set({ team: e.target.checked })} />
          <span>Build with a team of agents in parallel</span>
        </label>
        <p className="hint">Off (recommended): one designer builds the whole film, looks at it and fixes it. On: a lead and one agent per scene work at the same time; faster, but less of one piece, and it costs more.</p>
      </section>
      <ImagesSection settings={settings} set={set} />
    </>
  );
}

/** Illustrations: the person's image endpoint, its key and model, and a test image to see that it works. */
function ImagesSection({ settings, set }: { settings: Settings; set: (p: Partial<Settings>) => void }) {
  const im = settings.images ?? IMAGE_DEFAULTS;
  const setImages = (patch: Partial<ImageSettings>) => set({ images: { ...im, ...patch } });
  const aiKey = settings.provider === "custom" ? (settings.custom?.key ?? "") : settings.key;
  const [test, setTest] = useState<{ busy: boolean; error: string | null; image: string | null }>({ busy: false, error: null, image: null });
  async function tryIt() {
    setTest({ busy: true, error: null, image: null });
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Image-Key": im.key },
        body: JSON.stringify({ base: im.base, model: im.model, quality: "low", size: "1024x1024", prompt: "A red panda asleep on a mossy branch, flat paper cut-out illustration, cream background. No text." }),
      });
      const body = (await res.json().catch(() => null)) as { data?: string; error?: string } | null;
      if (!res.ok || !body?.data) throw new Error(body?.error ?? `The endpoint answered ${res.status}.`);
      setTest({ busy: false, error: null, image: body.data });
    } catch (err) {
      setTest({ busy: false, error: err instanceof Error ? err.message : String(err), image: null });
    }
  }
  return (
    <section className="settings-card">
      <h3>Illustrations</h3>
      <label className="switch">
        <input type="checkbox" role="switch" checked={im.on} onChange={(e) => setImages({ on: e.target.checked })} />
        <span>Let the designer make illustrations with an image model</span>
      </label>
      <p className="hint">For what code cannot draw well: places, animals, objects, moments in history. At most {MAX_PICTURES} per film, all in one art style; numbers, diagrams and words stay in code. Each image is billed on the image endpoint.</p>
      {im.on ? (
        <>
          <label className="field">
            <span>Base URL</span>
            <input type="url" spellCheck={false} value={im.base} onChange={(e) => setImages({ base: e.target.value.trim() })} placeholder="https://api-images.bynara.id/v1" />
            <small className="hint">The address before /images/generations and /images/edits.</small>
          </label>
          <label className="field">
            <span>API key</span>
            <input type="password" autoComplete="off" spellCheck={false} value={im.key} onChange={(e) => setImages({ key: e.target.value.trim() })} placeholder="Your key for this endpoint" />
            {aiKey && im.key !== aiKey ? (
              <button type="button" className="link" onClick={() => setImages({ key: aiKey })}>
                Use the same key as my AI endpoint
              </button>
            ) : null}
          </label>
          <div className="pair">
            <label className="field">
              <span>Model</span>
              <input type="text" spellCheck={false} value={im.model} onChange={(e) => setImages({ model: e.target.value.trim() })} placeholder="gpt-image-2" />
            </label>
            <div className="field">
              <span>Quality</span>
              <div className="seg" role="radiogroup" aria-label="Image quality">
                {(["low", "medium", "high"] as const).map((q) => (
                  <button key={q} type="button" role="radio" aria-checked={im.quality === q} onClick={() => setImages({ quality: q })}>
                    {q[0].toUpperCase() + q.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="assist">
            <button type="button" className="btn" onClick={() => void tryIt()} disabled={test.busy || !im.base || !im.key || !im.model}>
              {test.busy ? "Making a test image…" : "Make a test image"}
            </button>
            <small className={test.error ? "error" : "hint"}>{test.error ?? "One small, low-quality image on this key, to check the endpoint works."}</small>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {test.image ? <img className="image-test" src={test.image} alt="Test illustration from the image endpoint" /> : null}
        </>
      ) : null}
    </section>
  );
}

const TEST_LINE: Record<"id" | "en", string> = { id: "Halo! Ini OneMotion dari OneAPI. Buat video peluncuranmu di oneapi.id.", en: "Hi! This is OneMotion by OneAPI. Make your launch film at oneapi.id." };

function VoiceSection({ settings, set }: { settings: Settings; set: (p: Partial<Settings>) => void }) {
  const v = settings.voice ?? { on: false, key: "", voiceId: "", voiceName: "" };
  const setVoice = (patch: Partial<NonNullable<Settings["voice"]>>) => set({ voice: { ...v, ...patch } });
  const tuning: VoiceTuning = v.tuning ?? {};
  const [voices, setVoices] = useState<Voice[]>([]);
  const [state, setState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const [lang, setLang] = useState<"id" | "en">("id");
  const [line, setLine] = useState(TEST_LINE.id);
  const [test, setTest] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const play = (src: string) => {
    audio.current?.pause();
    audio.current = new Audio(src);
    void audio.current.play().catch(() => {});
  };

  const [library, setLibrary] = useState<{ gender: "female" | "male"; list: LibraryVoice[]; busy: string | null; error: string | null }>({ gender: "female", list: [], busy: null, error: null });

  async function findNative() {
    setLibrary((l) => ({ ...l, busy: "search", error: null }));
    try {
      const list = await libraryVoices(v.key.trim(), lang, library.gender);
      setLibrary((l) => ({ ...l, list, busy: null }));
    } catch (err) {
      setLibrary((l) => ({ ...l, busy: null, error: err instanceof Error ? err.message : String(err) }));
    }
  }

  /** A Voice Library voice becomes one of the person's voices, and the voice their videos speak with. */
  async function pickNative(x: LibraryVoice) {
    setLibrary((l) => ({ ...l, busy: x.id, error: null }));
    try {
      const id = await addLibraryVoice(v.key.trim(), x);
      setVoice({ voiceId: id, voiceName: x.name });
      setVoices(await listVoices(v.key.trim()));
      setLibrary((l) => ({ ...l, busy: null }));
    } catch (err) {
      setLibrary((l) => ({ ...l, busy: null, error: err instanceof Error ? err.message : String(err) }));
    }
  }

  async function load() {
    setState({ loading: true, error: null });
    try {
      const list = await listVoices(v.key.trim());
      setVoices(list);
      setState({ loading: false, error: null });
      if (!list.some((x) => x.id === v.voiceId) && list[0]) setVoice({ voiceId: list[0].id, voiceName: list[0].name });
    } catch (err) {
      setVoices([]);
      setState({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function speakTest() {
    setTest({ busy: true, error: null });
    try {
      const blob = await speak(v.key, v.voiceId, spoken(line, lang, studioLexicon(settings)), lang, undefined, v.tuning);
      play(URL.createObjectURL(blob));
      setTest({ busy: false, error: null });
    } catch (err) {
      setTest({ busy: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const selected = voices.find((x) => x.id === v.voiceId);
  return (
    <>
      <section className="settings-card">
        <h2>Voice and music</h2>
        <label className="switch">
          <input type="checkbox" role="switch" checked={v.on} onChange={(e) => setVoice({ on: e.target.checked })} />
          <span>Narrate my videos with ElevenLabs</span>
        </label>
        <label className="field">
          <span>ElevenLabs API key</span>
          <input type="password" autoComplete="off" spellCheck={false} value={v.key} onChange={(e) => setVoice({ key: e.target.value.trim() })} placeholder="sk_..." />
          <small className="hint">Goes from this device straight to ElevenLabs. Free plans: built-in voices, non-commercial videos only; Voice Library voices and commercial use need a paid plan.</small>
        </label>
        <div className="assist">
          <button type="button" className="btn" onClick={() => void load()} disabled={!v.key || state.loading}>
            {state.loading ? "Loading voices…" : voices.length ? "Reload voices" : "Load my voices"}
          </button>
          {state.error ? <small className="error">{state.error}</small> : null}
        </div>
        {voices.length ? (
          <div className="row">
            <label className="field" style={{ flex: 1 }}>
              <span>Voice</span>
              <select value={v.voiceId} onChange={(e) => setVoice({ voiceId: e.target.value, voiceName: voices.find((x) => x.id === e.target.value)?.name ?? "" })}>
                {voices.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                    {x.category !== "premade" ? " (yours)" : ""}
                    {x.about ? `  ·  ${x.about}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn" style={{ alignSelf: "flex-end" }} onClick={() => selected?.previewUrl && play(selected.previewUrl)} disabled={!selected?.previewUrl} title="ElevenLabs' own sample: free">
              Sample
            </button>
          </div>
        ) : v.voiceName ? (
          <p className="hint">Voice: {v.voiceName}. Load your voices to change it.</p>
        ) : null}
        <label className="field">
          <span>Narration language</span>
          <select value={v.language ?? ""} onChange={(e) => setVoice({ language: e.target.value || undefined })}>
            <option value="">Same as the video&apos;s words</option>
            <option value="id">Indonesian</option>
            <option value="en">English</option>
          </select>
          <small className="hint">An English brief can still be narrated in Indonesian: the on-screen words follow the brief, the voice lines are written and spoken in this language. Pick a voice native to it.</small>
        </label>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: 1 }}>
            <span>Native voices from the Voice Library</span>
            <small className="hint">A voice born in the language reads it without an accent; ElevenLabs&apos; own voices are American or British.</small>
          </label>
          <select value={lang} onChange={(e) => setLang(e.target.value as "id" | "en")} aria-label="Language">
            <option value="id">Indonesian</option>
            <option value="en">English</option>
          </select>
          <select value={library.gender} onChange={(e) => setLibrary((l) => ({ ...l, gender: e.target.value as "female" | "male" }))} aria-label="Gender">
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
          <button type="button" className="btn" onClick={() => void findNative()} disabled={!v.key || library.busy !== null}>
            {library.busy === "search" ? "Searching…" : "Find voices"}
          </button>
        </div>
        {library.error ? <small className="error">{library.error}</small> : null}
        {library.list.length ? (
          <ul className="lines">
            {library.list.map((x) => (
              <li key={x.id} className="row" style={{ alignItems: "center" }}>
                <span style={{ flex: 1 }}>
                  <strong>{x.name}</strong> <span className="hint">· {x.about}</span>
                </span>
                <button type="button" className="btn small" onClick={() => x.previewUrl && play(x.previewUrl)} disabled={!x.previewUrl} title="ElevenLabs' own sample: free">
                  Sample
                </button>
                <button type="button" className="btn small" onClick={() => void pickNative(x)} disabled={library.busy !== null || v.voiceName === x.name}>
                  {library.busy === x.id ? "Adding…" : v.voiceName === x.name ? "In use" : "Use"}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {library.list.length ? <small className="hint">Use adds the voice to your ElevenLabs voices (a paid plan, one voice slot) and picks it here.</small> : null}
      </section>

      <section className="settings-card">
        <h3>Music</h3>
        <div className="choices" role="radiogroup" aria-label="Music source">
          <button type="button" role="radio" aria-checked={(settings.music ?? "library") === "library"} className="choice" onClick={() => set({ music: "library" })}>
            <strong>Library track</strong>
            <span>{LIBRARY.length} free public-domain tracks. The art director picks one; a track played in your last four videos is swapped for the closest unused one.</span>
          </button>
          <button type="button" role="radio" aria-checked={settings.music === "elevenlabs"} className="choice" onClick={() => set({ music: "elevenlabs" })}>
            <strong>ElevenLabs Music</strong>
            <span>A new bed for every video, to its mood and length, with the key above. Paid plans only (Starter and up): about 400 credits for a 30 s video. On the free plan ElevenLabs refuses music, and the video plays a library track.</span>
          </button>
          <button type="button" role="radio" aria-checked={settings.music === "stableaudio"} className="choice" onClick={() => set({ music: "stableaudio" })}>
            <strong>Stable Audio</strong>
            <span>Stable Audio 3 composes the bed with your stableaudio.com account and its credits. Unofficial: it uses the web app&apos;s login token, which expires after a few hours.</span>
          </button>
        </div>
        {settings.music === "elevenlabs" && !v.key ? <p className="error">Add your ElevenLabs API key above to use ElevenLabs Music.</p> : null}
        {settings.music === "stableaudio" ? (
          <label className="field">
            <span>Stable Audio token</span>
            <input type="password" autoComplete="off" spellCheck={false} value={settings.stableAudio?.token ?? ""} onChange={(e) => set({ stableAudio: { token: e.target.value.trim().replace(/^Bearer\s+/i, "") } })} placeholder="eyJhbGciOi..." />
            <small className={tokenLeft(settings.stableAudio?.token) === "expired" ? "error" : "hint"}>
              {settings.stableAudio?.token ? `${tokenLeft(settings.stableAudio.token) === "expired" ? "This token has expired" : tokenLeft(settings.stableAudio.token)}. ` : ""}Log in at stableaudio.com, open the browser&apos;s DevTools, Network tab, generate once, and copy the Bearer token of the request to api.stableaudio.com. It goes through this app&apos;s server to Stable Audio only. Without a working token the video plays a library track.
            </small>
          </label>
        ) : null}
        <p className="hint">You can change any video&apos;s track afterwards in its Music tab; the picture and narration stay as they are.</p>
      </section>

      <section className="settings-card">
        <h3>Delivery</h3>
        {(
          [
            ["stability", "Stability", 0, 1, "Lower is more expressive, higher is steadier."],
            ["similarity", "Similarity", 0, 1, "How closely it keeps to the original voice."],
            ["style", "Style", 0, 1, "Exaggerates the voice's style; 0 is the most stable."],
            ["speed", "Speed", 0.7, 1.2, "1 is the voice's own pace."],
          ] as const
        ).map(([k, label, min, max, help]) => (
          <label className="field" key={k}>
            <span className="field-row">
              {label}
              <span className="mono hint">{tuning[k] === undefined ? "voice default" : tuning[k]?.toFixed(2)}</span>
            </span>
            <input type="range" min={min} max={max} step={0.05} value={tuning[k] ?? (k === "speed" ? 1 : 0.5)} onChange={(e) => setVoice({ tuning: { ...tuning, [k]: Number(e.target.value) } })} />
            <small className="hint">{help}</small>
          </label>
        ))}
        <button type="button" className="btn ghost small" onClick={() => setVoice({ tuning: undefined })} disabled={!v.tuning}>
          Use the voice&apos;s own settings
        </button>
      </section>

      <section className="settings-card">
        <h3>Test the voice</h3>
        <div className="lexicon-try">
          <label className="field">
            <span>Line</span>
            <input value={line} onChange={(e) => setLine(e.target.value)} />
          </label>
          <select
            aria-label="Language"
            value={lang}
            onChange={(e) => {
              const l = e.target.value as "id" | "en";
              setLang(l);
              if (Object.values(TEST_LINE).includes(line)) setLine(TEST_LINE[l]);
            }}
          >
            <option value="id">Indonesian</option>
            <option value="en">English</option>
          </select>
        </div>
        <p className="said">
          <span>Said as</span> {spoken(line, lang, studioLexicon(settings))}
        </p>
        <div className="assist">
          <button type="button" className="btn primary" onClick={() => void speakTest()} disabled={!v.key || !v.voiceId || test.busy || !line.trim()}>
            {test.busy ? "Speaking…" : "Speak this line"}
          </button>
          <small className={test.error ? "error" : "hint"}>{test.error ?? "With this voice, its delivery and your pronunciations. Uses a few ElevenLabs credits."}</small>
        </div>
      </section>
    </>
  );
}
