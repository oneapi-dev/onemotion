"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogModel } from "@/director/input";
import { listVoices, type Voice } from "@/voice/eleven";
import type { Settings } from "./store";

/**
 * The OneAPI key and the model the director runs on, and the optional
 * voiceover: an ElevenLabs key and a voice. Keys stay in this browser; the
 * OneAPI key travels only with each design request, the ElevenLabs key only
 * to ElevenLabs.
 */
export function SettingsDialog({
  open,
  settings,
  models,
  onSave,
  onClose,
}: {
  open: boolean;
  settings: Settings;
  models: CatalogModel[];
  onSave: (s: Settings) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState(settings.key);
  const [model, setModel] = useState(settings.model);
  const [voiceOn, setVoiceOn] = useState(settings.voice?.on ?? false);
  const [webSearch, setWebSearch] = useState(settings.webSearch ?? false);
  const [team, setTeam] = useState(settings.team ?? false);
  const [voiceKey, setVoiceKey] = useState(settings.voice?.key ?? "");
  const [voiceId, setVoiceId] = useState(settings.voice?.voiceId ?? "");
  const [voiceName, setVoiceName] = useState(settings.voice?.voiceName ?? "");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesState, setVoicesState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const sample = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setKey(settings.key);
      setModel(settings.model);
      setVoiceOn(settings.voice?.on ?? false);
      setWebSearch(settings.webSearch ?? false);
      setTeam(settings.team ?? false);
      setVoiceKey(settings.voice?.key ?? "");
      setVoiceId(settings.voice?.voiceId ?? "");
      setVoiceName(settings.voice?.voiceName ?? "");
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, settings]);

  async function loadVoices() {
    setVoicesState({ loading: true, error: null });
    try {
      const list = await listVoices(voiceKey.trim());
      setVoices(list);
      setVoicesState({ loading: false, error: null });
      if (!list.some((v) => v.id === voiceId) && list[0]) {
        setVoiceId(list[0].id);
        setVoiceName(list[0].name);
      }
    } catch (err) {
      setVoices([]);
      setVoicesState({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  function preview() {
    const v = voices.find((x) => x.id === voiceId);
    if (!v?.previewUrl) return;
    sample.current?.pause();
    sample.current = new Audio(v.previewUrl);
    void sample.current.play().catch(() => {});
  }

  const chatModels = models.filter((m) => m.capabilities.includes("Chat") || m.capabilities.length === 0);
  const selected = voices.find((v) => v.id === voiceId);

  return (
    <dialog
      ref={ref}
      className="dialog"
      onClose={() => {
        sample.current?.pause();
        onClose();
      }}
      aria-labelledby="settings-title"
    >
      <form
        method="dialog"
        className="dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          sample.current?.pause();
          onSave({ ...settings, key: key.trim(), model: model.trim(), webSearch, team, voice: { on: voiceOn, key: voiceKey.trim(), voiceId, voiceName } });
        }}
      >
        <h2 id="settings-title">Settings</h2>
        <p className="muted">
          OneMotion designs each video with a model on OneAPI, billed to your own OneAPI key like any API call. The key stays in this
          browser.
        </p>
        <label className="field">
          <span>OneAPI API key</span>
          <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-..." />
        </label>
        <p className="hint">
          No key yet? Create one at{" "}
          <a href="https://oneapi.id/api-keys" target="_blank" rel="noreferrer">
            oneapi.id
          </a>
          .
        </p>
        <label className="field">
          <span>Model</span>
          {chatModels.length ? (
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">Choose a model</option>
              {chatModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                  {m.inputPrice ? `  ·  $${Number(m.inputPrice)} / $${Number(m.outputPrice)} per 1M` : ""}
                </option>
              ))}
            </select>
          ) : (
            <input type="text" spellCheck={false} value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model id, e.g. gemini-3.8-flash" />
          )}
        </label>
        <p className="hint">A fast model without long reasoning designs in 10 to 20 seconds.</p>
        <label className="inline">
          <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} style={{ width: "auto" }} />
          <span>Let the AI search the web while it designs</span>
        </label>
        <p className="hint">
          OneAPI web search: the art director and the lead look things up and read pages (prices, docs, real logos). $0.005 per search and $0.0001 per page
          read on your key, at most 5 searches per step. The model must support tools.
        </p>
        <label className="inline">
          <input type="checkbox" checked={team} onChange={(e) => setTeam(e.target.checked)} style={{ width: "auto" }} />
          <span>Build with a team of agents in parallel</span>
        </label>
        <p className="hint">
          Off (recommended): one designer builds the whole film, looks at it and fixes it, like a motion designer in their own editor. On: a lead and
          one agent per beat work at the same time; faster, but the film is less of one piece and each agent rereads the brief, so it costs more.
        </p>

        <h3 className="settings-section">Voiceover (optional)</h3>
        <label className="inline">
          <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} style={{ width: "auto" }} />
          <span>Narrate my videos with ElevenLabs</span>
        </label>
        {voiceOn ? (
          <>
            <label className="field">
              <span>ElevenLabs API key</span>
              <input type="password" autoComplete="off" spellCheck={false} value={voiceKey} onChange={(e) => setVoiceKey(e.target.value)} placeholder="sk_..." />
            </label>
            <div className="row wrap">
              <button type="button" className="btn small" onClick={() => void loadVoices()} disabled={!voiceKey.trim() || voicesState.loading}>
                {voicesState.loading ? "Loading voices…" : voices.length ? "Reload voices" : "Load my voices"}
              </button>
              {voicesState.error ? (
                <span className="error" role="alert">
                  {voicesState.error}
                </span>
              ) : null}
            </div>
            {voices.length ? (
              <div className="row">
                <label className="field" style={{ flex: 1 }}>
                  <span>Voice</span>
                  <select
                    value={voiceId}
                    onChange={(e) => {
                      setVoiceId(e.target.value);
                      setVoiceName(voices.find((v) => v.id === e.target.value)?.name ?? "");
                    }}
                  >
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.category !== "premade" ? " (yours)" : ""}
                        {v.about ? `  ·  ${v.about}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn small" onClick={preview} disabled={!selected?.previewUrl} aria-label={`Play a sample of ${selected?.name ?? "the voice"}`} style={{ alignSelf: "flex-end" }}>
                  ▶ Sample
                </button>
              </div>
            ) : voiceName ? (
              <p className="hint">Voice: {voiceName}. Load your voices to change it.</p>
            ) : null}
            <p className="hint">
              The director writes one line per scene in your brief&apos;s language and ElevenLabs reads it, billed to your key (roughly 70 to
              250 credits for a 15 second video). Free ElevenLabs plans can use the built-in voices only, for non-commercial videos; native
              voices from the Voice Library (an Indonesian narrator, say) and commercial use need a paid plan. Add a library voice to your
              ElevenLabs account and it appears here.
            </p>
          </>
        ) : null}

        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!key.trim() || !model.trim() || (voiceOn && (!voiceKey.trim() || !voiceId))}>
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
