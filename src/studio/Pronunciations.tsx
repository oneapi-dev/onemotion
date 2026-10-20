"use client";

import { useState } from "react";
import { spoken, type Pronunciation } from "@/voice/spoken";

const LANGS = [
  { id: "", label: "All" },
  { id: "id", label: "Indonesian" },
  { id: "en", label: "English" },
];

/**
 * A pronunciation dictionary: how a name, domain or acronym is said, for
 * every language or one. What the voice will be sent for a sample line
 * shows as you type, free (no voice is called).
 */
export function PronunciationEditor({ value, onChange, sample, language = "id", hint }: { value: Pronunciation[]; onChange: (next: Pronunciation[]) => void; sample?: string; language?: string; hint?: string }) {
  const [tryLine, setTryLine] = useState(sample ?? "Coba OneAPI di oneapi.id, mulai $5.");
  const [tryLang, setTryLang] = useState(language);
  const set = (i: number, patch: Partial<Pronunciation>) => onChange(value.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  return (
    <div className="lexicon">
      {hint ? <p className="hint">{hint}</p> : null}
      {value.length ? (
        <div className="lexicon-rows" role="table" aria-label="Pronunciations">
          <div className="lexicon-row lexicon-head" role="row">
            <span role="columnheader">Written</span>
            <span role="columnheader">Said as</span>
            <span role="columnheader">Language</span>
            <span />
          </div>
          {value.map((p, i) => (
            <div className="lexicon-row" role="row" key={i}>
              <input aria-label="Written" value={p.term} spellCheck={false} onChange={(e) => set(i, { term: e.target.value })} placeholder="OneAPI" />
              <input aria-label="Said as" value={p.say} spellCheck={false} onChange={(e) => set(i, { say: e.target.value })} placeholder="wanapi" />
              <select aria-label="Language" value={p.lang ?? ""} onChange={(e) => set(i, { lang: e.target.value || undefined })}>
                {LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
                {p.lang && !LANGS.some((l) => l.id === p.lang) ? <option value={p.lang}>{p.lang}</option> : null}
              </select>
              <button type="button" className="btn ghost small" aria-label={`Remove ${p.term || "this pronunciation"}`} onClick={() => onChange(value.filter((_, k) => k !== i))}>
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint">No pronunciations: names are read as the voice guesses.</p>
      )}
      <button type="button" className="btn small" onClick={() => onChange([...value, { term: "", say: "" }])}>
        Add a pronunciation
      </button>
      <div className="lexicon-try">
        <label className="field">
          <span>Try a line</span>
          <input value={tryLine} onChange={(e) => setTryLine(e.target.value)} />
        </label>
        <select aria-label="Language of the line" value={tryLang} onChange={(e) => setTryLang(e.target.value)}>
          {LANGS.filter((l) => l.id).map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <p className="hint" aria-live="polite">
          The voice is sent <q>{spoken(tryLine, tryLang, value)}</q>; on screen and in captions it stays as written.
        </p>
      </div>
    </div>
  );
}
