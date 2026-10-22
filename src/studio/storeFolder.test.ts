import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "@/app/api/store/route";
import { POST as LOCATION } from "@/app/api/store/location/route";
import type { Project, Settings } from "./store";

/** The studio's store against the real route handlers and a real folder, with a browser stubbed around it. */

let tmp = "";
let storage: Map<string, string>;
let down = false;

function stubBrowser() {
  storage = new Map();
  vi.stubGlobal("window", {
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) },
    addEventListener: () => undefined,
  });
  vi.stubGlobal("document", { addEventListener: () => undefined, visibilityState: "visible" });
  // The browser's fetch, answered by the route handlers as the studio's server would.
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    if (down) return new Response("Forbidden", { status: 403 });
    const req = new Request(`http://localhost:3000${url}`, { ...init, headers: { host: "localhost:3000", ...(init.headers as Record<string, string>) } });
    if (url === "/api/store/location") return LOCATION(req);
    return init.method === "PUT" ? PUT(req) : GET(req);
  });
}

const project = (id: string, extra: Partial<Project> = {}) => ({ id, createdAt: "2026-10-23", brief: id, website: "", format: "landscape", tone: "auto", site: null, ...extra }) as unknown as Project;
const settings = (key: string): Settings => ({ key, model: "m" });

async function fresh() {
  vi.resetModules();
  return import("./store");
}

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "onemotion-studio-"));
  process.env.ONEMOTION_DATA_DIR = path.join(tmp, "data");
  process.env.ONEMOTION_CONFIG_DIR = path.join(tmp, "cfg");
  down = false;
  stubBrowser();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.ONEMOTION_DATA_DIR;
  delete process.env.ONEMOTION_CONFIG_DIR;
  delete process.env.ONEMOTION_DOCUMENTS;
  await rm(tmp, { recursive: true, force: true });
});

describe("the studio's store with a data folder", () => {
  it("keeps what is saved in the folder, where another origin finds it", async () => {
    const a = await fresh();
    await a.hydrate();
    expect(a.storageInfo().folder).toBe(path.join(tmp, "data"));
    a.saveProject(project("p1"));
    a.saveSettings(settings("sk-shared"));
    await a.flush();
    // A second studio (another origin, so another localStorage) reads the same folder.
    stubBrowser();
    const b = await fresh();
    await b.hydrate();
    expect(b.loadProjects().map((p) => p.id)).toEqual(["p1"]);
    expect(b.loadSettings().key).toBe("sk-shared");
  });

  it("copies this browser's old projects and settings in once, without duplicating them", async () => {
    storage.set("oneapi-motion:projects", JSON.stringify([project("old1"), project("old2")]));
    storage.set("oneapi-motion:settings", JSON.stringify(settings("sk-old")));
    const a = await fresh();
    await a.hydrate();
    expect(a.loadProjects().map((p) => p.id)).toEqual(["old1", "old2"]);
    expect(a.loadSettings().key).toBe("sk-old");
    // Deleting a project must not bring it back from the old copy on the next start.
    a.deleteProject("old1");
    await a.flush();
    const b = await fresh();
    await b.hydrate();
    expect(b.loadProjects().map((p) => p.id)).toEqual(["old2"]);
  });

  it("merges a second browser's old projects, and the folder's settings win", async () => {
    const a = await fresh();
    await a.hydrate();
    a.saveProject(project("exe"));
    a.saveSettings(settings("sk-first"));
    await a.flush();
    stubBrowser();
    storage.set("oneapi-motion:projects", JSON.stringify([project("browser")]));
    storage.set("oneapi-motion:settings", JSON.stringify(settings("sk-second")));
    const b = await fresh();
    await b.hydrate();
    expect(b.loadProjects().map((p) => p.id).sort()).toEqual(["browser", "exe"]);
    expect(b.loadSettings().key).toBe("sk-first");
  });

  it("falls back to the browser's storage when the server offers no folder", async () => {
    down = true;
    const a = await fresh();
    await a.hydrate();
    expect(a.storageInfo().folder).toBeNull();
    a.saveProject(project("local"));
    a.saveSettings(settings("sk-local"));
    expect(JSON.parse(storage.get("oneapi-motion:projects") ?? "[]")).toHaveLength(1);
    expect(a.loadSettings().key).toBe("sk-local");
  });

  it("keeps every project in a folder, and retries a save that failed", async () => {
    const a = await fresh();
    await a.hydrate();
    for (let i = 0; i < 15; i++) a.saveProject(project(`p${i}`));
    down = true;
    await a.flush();
    expect(a.storageInfo().error).toMatch(/403/);
    down = false;
    await a.flush();
    expect(a.storageInfo().error).toBeNull();
    stubBrowser();
    const b = await fresh();
    await b.hydrate();
    expect(b.loadProjects()).toHaveLength(15);
  });

  it("moves to another folder with the projects copied", async () => {
    // The folder is chosen through the config, not fixed by the environment.
    delete process.env.ONEMOTION_DATA_DIR;
    process.env.ONEMOTION_DOCUMENTS = path.join(tmp, "Documents");
    const a = await fresh();
    await a.hydrate();
    a.saveProject(project("p1"));
    const next = path.join(tmp, "elsewhere");
    expect(await a.changeFolder(next, true)).toEqual({ root: next, copied: 1 });
    stubBrowser();
    const b = await fresh();
    await b.hydrate();
    expect(b.storageInfo().folder).toBe(next);
    expect(b.loadProjects().map((p) => p.id)).toEqual(["p1"]);
  });
});
