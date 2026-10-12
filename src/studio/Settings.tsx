"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogModel } from "@/director/input";
import type { Settings } from "./store";

/**
 * The OneAPI key and the model the director runs on. The key stays in this
 * browser and travels only with each design request.
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

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setKey(settings.key);
      setModel(settings.model);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, settings]);

  const chatModels = models.filter((m) => m.capabilities.includes("Chat") || m.capabilities.length === 0);

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="settings-title">
      <form
        method="dialog"
        className="dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ key: key.trim(), model: model.trim() });
        }}
      >
        <h2 id="settings-title">Settings</h2>
        <p className="muted">
          Motion designs each video with a model on OneAPI, billed to your own OneAPI key like any API call. The key stays in this
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
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!key.trim() || !model.trim()}>
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
