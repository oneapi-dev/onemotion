import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeRoot, dataRoot, listProjects, readSettings, removeProject, storeAllowed, validId, writeProject, writeSettings } from "./dataDir";

let tmp = "";
const KEYS = ["ONEMOTION_DATA_DIR", "ONEMOTION_CONFIG_DIR", "ONEMOTION_DOCUMENTS", "ONEMOTION_STORE"] as const;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "onemotion-store-"));
  for (const k of KEYS) delete process.env[k];
  process.env.ONEMOTION_CONFIG_DIR = path.join(tmp, "config");
  process.env.ONEMOTION_DOCUMENTS = path.join(tmp, "Documents");
});

afterEach(async () => {
  for (const k of KEYS) delete process.env[k];
  await rm(tmp, { recursive: true, force: true });
});

describe("the data folder", () => {
  it("defaults to Documents/OneMotion and remembers it in the config", async () => {
    const root = await dataRoot();
    expect(root).toBe(path.join(tmp, "Documents", "OneMotion"));
    expect(JSON.parse(await readFile(path.join(tmp, "config", "config.json"), "utf8"))).toEqual({ dir: root });
    // A second program follows the config, even if Documents would now resolve elsewhere.
    process.env.ONEMOTION_DOCUMENTS = path.join(tmp, "Elsewhere");
    expect(await dataRoot()).toBe(root);
  });

  it("saves one file per project, newest first, and removes them", async () => {
    await writeProject({ id: "a", brief: "first" });
    await new Promise((r) => setTimeout(r, 15));
    await writeProject({ id: "b", brief: "second" });
    const { projects, skipped } = await listProjects();
    expect(projects.map((p) => p.id)).toEqual(["b", "a"]);
    expect(skipped).toBe(0);
    await writeProject({ id: "a", brief: "first, edited" });
    expect((await listProjects()).projects[0]).toMatchObject({ id: "a", brief: "first, edited" });
    await removeProject("a");
    expect((await listProjects()).projects.map((p) => p.id)).toEqual(["b"]);
  });

  it("leaves no temporary files and skips a file that does not parse", async () => {
    await writeProject({ id: "ok" });
    const dir = path.join(await dataRoot(), "projects");
    await writeFile(path.join(dir, "broken.json"), "{ not json");
    await writeFile(path.join(dir, "wrong-name.json"), JSON.stringify({ id: "other" }));
    const { projects, skipped } = await listProjects();
    expect(projects.map((p) => p.id)).toEqual(["ok"]);
    expect(skipped).toBe(2);
    expect((await readdir(dir)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("refuses ids that could leave the folder", async () => {
    for (const id of ["../x", "a/b", "a\\b", "", ".", "x".repeat(101)]) {
      expect(validId(id)).toBe(false);
      await expect(writeProject({ id })).rejects.toThrow();
      await expect(removeProject(id)).rejects.toThrow();
    }
    expect(validId("3f2c-9a_B")).toBe(true);
  });

  it("keeps settings apart from the projects folder", async () => {
    expect(await readSettings()).toBeNull();
    await writeSettings({ key: "sk-test", model: "m" });
    expect(await readSettings()).toEqual({ key: "sk-test", model: "m" });
    await writeProject({ id: "p" });
    const root = await dataRoot();
    expect(JSON.stringify(await readdir(root, { recursive: true }))).not.toContain("settings");
    expect((await readdir(path.join(tmp, "config"))).sort()).toEqual(["config.json", "settings.json"]);
  });
});

describe("changing the data folder", () => {
  it("copies projects when asked and keeps the ones already there", async () => {
    await writeProject({ id: "a", brief: "old a" });
    await writeProject({ id: "b", brief: "old b" });
    const next = path.join(tmp, "Other", "Films");
    await mkdirWith(path.join(next, "projects"), "a", { id: "a", brief: "already there" });
    const out = await changeRoot(next, true);
    expect(out).toEqual({ root: next, copied: 1 });
    expect(await dataRoot()).toBe(next);
    const byId = Object.fromEntries((await listProjects()).projects.map((p) => [p.id, p.brief]));
    expect(byId).toEqual({ a: "already there", b: "old b" });
  });

  it("starts empty without the copy, and rejects a relative path", async () => {
    await writeProject({ id: "a" });
    await changeRoot(path.join(tmp, "Empty"), false);
    expect((await listProjects()).projects).toEqual([]);
    await expect(changeRoot("relative/dir", false)).rejects.toThrow(/full folder path/);
    await expect(changeRoot("   ", false)).rejects.toThrow(/full folder path/);
  });

  it("is fixed when the environment names the folder", async () => {
    process.env.ONEMOTION_DATA_DIR = path.join(tmp, "Fixed");
    expect(await dataRoot()).toBe(path.join(tmp, "Fixed"));
    await expect(changeRoot(path.join(tmp, "Moved"), false)).rejects.toThrow(/ONEMOTION_DATA_DIR/);
  });
});

async function mkdirWith(dir: string, id: string, doc: Record<string, unknown>) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify({ id, ...doc }));
}

describe("who may use the store", () => {
  const req = (headers: Record<string, string>) => new Request("http://localhost/api/store", { headers });
  const ok = { host: "localhost:3000", "x-onemotion-store": "1" };

  it("lets this computer in with the header", () => {
    expect(storeAllowed(req(ok))).toBe(true);
    expect(storeAllowed(req({ ...ok, host: "127.0.0.1:41233" }))).toBe(true);
    expect(storeAllowed(req({ ...ok, host: "[::1]:3000" }))).toBe(true);
  });

  it("refuses another host (DNS rebinding), a missing header, and a hosted copy", () => {
    expect(storeAllowed(req({ ...ok, host: "evil.example" }))).toBe(false);
    expect(storeAllowed(req({ ...ok, host: "localhost.evil.example" }))).toBe(false);
    expect(storeAllowed(req({ host: "localhost:3000" }))).toBe(false);
    process.env.ONEMOTION_STORE = "off";
    expect(storeAllowed(req(ok))).toBe(false);
  });
});
