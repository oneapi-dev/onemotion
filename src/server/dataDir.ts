import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Where the studio keeps what the person made: one folder on this computer,
 * shared by the desktop app and `npm start`, so both show the same projects.
 *
 *   <data folder>/projects/<id>.json   one file per project (default: Documents/OneMotion)
 *   ~/.onemotion/settings.json         settings, with the API keys: in the home folder,
 *                                      not in Documents, so a backup or a synced folder
 *                                      does not carry them
 *   ~/.onemotion/config.json           which data folder is in use
 *
 * ONEMOTION_DATA_DIR and ONEMOTION_CONFIG_DIR override the two places (tests, smoke).
 */

/** A project or settings document: the studio owns its shape; the server needs only the id. */
export type Doc = { id: string } & Record<string, unknown>;

const ID = /^[A-Za-z0-9_-]{1,100}$/;
export const validId = (id: unknown): id is string => typeof id === "string" && ID.test(id);

const configDir = () => process.env.ONEMOTION_CONFIG_DIR || path.join(os.homedir(), ".onemotion");
const configFile = () => path.join(configDir(), "config.json");
const settingsFile = () => path.join(configDir(), "settings.json");

/** Documents, as the desktop shell resolves it (a redirected Documents folder included); the home folder's otherwise. */
const defaultRoot = () => path.join(process.env.ONEMOTION_DOCUMENTS || path.join(os.homedir(), "Documents"), "OneMotion");

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** A write that never leaves half a file: to a temporary name, then renamed over the real one. */
async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value), "utf8");
  await rename(tmp, file);
}

/**
 * The data folder in use. The first run writes the default into the config,
 * so the next program to start (the desktop app or `npm start`) follows it
 * instead of working out Documents again.
 */
export async function dataRoot(): Promise<string> {
  if (process.env.ONEMOTION_DATA_DIR) return process.env.ONEMOTION_DATA_DIR;
  const saved = await readJson<{ dir?: string }>(configFile());
  if (saved?.dir && path.isAbsolute(saved.dir)) return saved.dir;
  const dir = defaultRoot();
  await writeJson(configFile(), { dir }).catch(() => undefined);
  return dir;
}

const projectsDir = async () => path.join(await dataRoot(), "projects");

/** Every project in the folder, most recently saved first. A file that does not parse is skipped and counted. */
export async function listProjects(): Promise<{ projects: Doc[]; skipped: number }> {
  const dir = await projectsDir();
  const names = await readdir(dir).catch(() => [] as string[]);
  const rows: { doc: Doc; at: number }[] = [];
  let skipped = 0;
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const file = path.join(dir, name);
    const doc = await readJson<Doc>(file);
    if (!doc || !validId(doc.id) || `${doc.id}.json` !== name) {
      skipped++;
      continue;
    }
    rows.push({ doc, at: (await stat(file)).mtimeMs });
  }
  rows.sort((a, b) => b.at - a.at);
  return { projects: rows.map((r) => r.doc), skipped };
}

export async function writeProject(doc: Doc): Promise<void> {
  if (!validId(doc.id)) throw new Error("A project needs an id of letters, digits, - and _.");
  await writeJson(path.join(await projectsDir(), `${doc.id}.json`), doc);
}

export async function removeProject(id: string): Promise<void> {
  if (!validId(id)) throw new Error("Not a project id.");
  await rm(path.join(await projectsDir(), `${id}.json`), { force: true });
}

export const readSettings = () => readJson<Record<string, unknown>>(settingsFile());
export const writeSettings = (settings: Record<string, unknown>) => writeJson(settingsFile(), settings);

/**
 * Moves the studio to another data folder. The folder must be an absolute
 * path the studio can write to; with `copy`, the projects in the current one
 * are copied over (a project the new folder already has is kept as it is).
 */
export async function changeRoot(dir: string, copy: boolean): Promise<{ root: string; copied: number }> {
  if (process.env.ONEMOTION_DATA_DIR) throw new Error("The data folder is set by ONEMOTION_DATA_DIR; change that instead.");
  const next = path.resolve(dir.trim());
  if (!dir.trim() || !path.isAbsolute(dir.trim())) throw new Error("Give a full folder path, like C:\\Users\\you\\Documents\\OneMotion.");
  const from = await projectsDir();
  const to = path.join(next, "projects");
  await mkdir(to, { recursive: true });
  const probe = path.join(to, ".write-test");
  await writeFile(probe, "ok").catch(() => {
    throw new Error("That folder cannot be written to.");
  });
  await rm(probe, { force: true });
  let copied = 0;
  if (copy && path.resolve(from) !== path.resolve(to)) {
    for (const name of await readdir(from).catch(() => [] as string[])) {
      if (!name.endsWith(".json") || (await stat(path.join(to, name)).then(() => true, () => false))) continue;
      await copyFile(path.join(from, name), path.join(to, name));
      copied++;
    }
  }
  await writeJson(configFile(), { dir: next });
  return { root: next, copied };
}

/**
 * Only this computer may use the store: a request must address a loopback
 * host (a web page reaching the server through DNS rebinding carries its own
 * host name) and carry a header that a page on another site cannot send
 * without a CORS preflight, which the server never answers. A hosted copy
 * of the studio therefore keeps everything in the browser, as before.
 */
export function storeAllowed(req: Request): boolean {
  if (process.env.ONEMOTION_STORE === "off") return false;
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const loopback = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return loopback && req.headers.get("x-onemotion-store") === "1";
}
