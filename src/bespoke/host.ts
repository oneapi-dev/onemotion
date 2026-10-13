"use client";

import type { FromSandbox, ToSandbox, WireFilm } from "./runtime/protocol";

/** Where the sandbox page lives. It is served by this app but runs with an opaque origin. */
export const SANDBOX_SRC = "/sandbox/index.html";
/** The iframe's sandbox: scripts only. No same-origin access, no forms, no popups, no top navigation. */
export const SANDBOX_FLAGS = "allow-scripts";

type Pending = { resolve: (v: FromSandbox) => void; reject: (e: Error) => void; onProgress?: (p: number) => void };

/**
 * The Studio's side of the sandbox: sends a film to show, asks for stills
 * and exports, and matches the answers. Only messages from this iframe's
 * window are read.
 */
export class Sandbox {
  private pending = new Map<string, Pending>();
  private ready: Promise<void>;
  private markReady!: () => void;
  private n = 0;
  onShown?: (frames: number) => void;
  onError?: (message: string) => void;

  private ping: ReturnType<typeof setInterval>;

  constructor(private frame: HTMLIFrameElement) {
    this.ready = new Promise((r) => (this.markReady = r));
    window.addEventListener("message", this.receive);
    // The sandbox may have started before this listener, or not yet: ask until it answers.
    this.ping = setInterval(() => frame.contentWindow?.postMessage({ type: "ping" } satisfies ToSandbox, "*"), 150);
  }

  dispose() {
    clearInterval(this.ping);
    window.removeEventListener("message", this.receive);
    for (const p of this.pending.values()) p.reject(new Error("The preview was closed."));
    this.pending.clear();
  }

  private receive = (e: MessageEvent<FromSandbox>) => {
    if (e.source !== this.frame.contentWindow || !e.data || typeof e.data !== "object") return;
    const m = e.data;
    if (m.type === "ready") {
      clearInterval(this.ping);
      return this.markReady();
    }
    if (m.type === "shown") return this.onShown?.(m.frames);
    if (m.type === "player-error") return this.onError?.(m.message);
    const p = this.pending.get(m.id);
    if (!p) return;
    if (m.type === "progress") return p.onProgress?.(m.progress);
    this.pending.delete(m.id);
    if (m.type === "failed") p.reject(new Error(m.message));
    else p.resolve(m);
  };

  private async send(msg: ToSandbox) {
    await this.ready;
    this.frame.contentWindow?.postMessage(msg, "*");
  }

  private request<T extends FromSandbox>(msg: ToSandbox & { id: string }, signal?: AbortSignal, onProgress?: (p: number) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.set(msg.id, { resolve: resolve as (v: FromSandbox) => void, reject, onProgress });
      signal?.addEventListener("abort", () => {
        void this.send({ type: "abort", id: msg.id });
        this.pending.delete(msg.id);
        reject(new DOMException("Aborted", "AbortError"));
      });
      void this.send(msg);
    });
  }

  show(film: WireFilm) {
    void this.send({ type: "show", film });
  }

  async stills(film: WireFilm, frames: number[], signal?: AbortSignal): Promise<{ images: Blob[]; warnings: string[] }> {
    const r = await this.request<Extract<FromSandbox, { type: "stills" }>>({ type: "stills", id: `s${++this.n}`, film, frames }, signal);
    return { images: r.images, warnings: r.warnings };
  }

  async exportMp4(film: WireFilm, onProgress: (p: number) => void, signal?: AbortSignal): Promise<Blob> {
    const r = await this.request<Extract<FromSandbox, { type: "exported" }>>({ type: "export", id: `e${++this.n}`, film }, signal, onProgress);
    return r.blob;
  }
}
