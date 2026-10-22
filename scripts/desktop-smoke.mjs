// Smoke test of the staged desktop server (desktop/server): starts it as the
// shell does, then checks the secret guard, the pages, the scene check (the
// TypeScript compiler over the kit, which needs files the standalone build
// must have carried) and the prompts. Exits non-zero on any failure.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const dir = path.join(process.cwd(), "desktop", "server");
const port = await new Promise((r) => {
  const s = net.createServer().listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => r(p));
  });
});
const secret = randomBytes(32).toString("hex");
// The store writes files: a temporary folder, never the person's Documents.
const scratch = mkdtempSync(path.join(os.tmpdir(), "onemotion-smoke-"));
const child = spawn(process.execPath, ["server.js"], { cwd: dir, env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", ONEMOTION_DESKTOP_SECRET: secret, ONEMOTION_DATA_DIR: path.join(scratch, "data"), ONEMOTION_CONFIG_DIR: path.join(scratch, "cfg") }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
child.stdout.on("data", (d) => (log += d));
child.stderr.on("data", (d) => (log += d));
const base = `http://127.0.0.1:${port}`;
const H = { "x-onemotion-desktop": secret };
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

try {
  const t0 = Date.now();
  for (;;) {
    try {
      await fetch(`${base}/`, { headers: H });
      break;
    } catch {
      if (Date.now() - t0 > 30_000) throw new Error(`server did not start:\n${log}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  check("server starts", true, `${Date.now() - t0} ms`);
  check("no secret: 403", (await fetch(`${base}/`)).status === 403);
  check("wrong secret: 403", (await fetch(`${base}/`, { headers: { "x-onemotion-desktop": "x".repeat(64) } })).status === 403);
  // fetch cannot set Host; a raw request can (DNS rebinding arrives with the attacker's host name).
  const rebound = await new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/", headers: { ...H, host: "evil.example" } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", () => resolve(0));
    req.end();
  });
  check("other host: 403", rebound === 403, String(rebound));
  const home = await fetch(`${base}/`, { headers: H });
  check("studio page", home.status === 200 && (await home.text()).includes("OneMotion"));
  const ex = await (await fetch(`${base}/api/scene/example?name=pattern`, { headers: H })).json();
  check("example film", Boolean(ex.files?.["scene/index.tsx"]));
  const c = await (await fetch(`${base}/api/scene/check`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ files: ex.files }) })).json();
  check("scene check (TypeScript over the kit)", c.ok === true, c.ok ? `${Object.keys(c.modules).length} modules` : c.errors?.slice(0, 3).join(" | "));
  const bad = await (await fetch(`${base}/api/scene/check`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ files: { ...ex.files, "scene/index.tsx": ex.files["scene/index.tsx"] + "\nconst x: number = 'no';" } }) })).json();
  check("scene check reports type errors", bad.ok === false && bad.errors.some((e) => /not assignable/.test(e)));
  // The film the studio opens on.
  const om = await (await fetch(`${base}/api/scene/example?name=onemotion`, { headers: H })).json();
  const omc = om.files ? await (await fetch(`${base}/api/scene/check`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ files: om.files }) })).json() : { ok: false, errors: ["missing"] };
  check("OneMotion intro film compiles", omc.ok === true, omc.ok ? "" : omc.errors?.slice(0, 2).join(" | "));
  const pr = await (await fetch(`${base}/api/scene/prompt`, { headers: H })).json();
  check("prompts (kit API inside)", typeof pr.agent === "string" && pr.agent.includes("--- @kit/motion ---") && pr.agent.includes("--- @kit/world ---") && pr.agent.includes("Motion craft"));
  const music = await fetch(`${base}/music/advertime.mp3`, { headers: H });
  check("bundled music", music.status === 200 && Number(music.headers.get("content-length")) > 100_000);
  const maps = readdirSync(path.join(dir, ".next", "static"), { recursive: true }).filter((f) => String(f).endsWith(".map"));
  check("no browser source maps", maps.length === 0, `${maps.length}`);
  const S = { ...H, "x-onemotion-store": "1", "Content-Type": "application/json" };
  check("store needs its header", (await fetch(`${base}/api/store`, { headers: H })).status === 403);
  const put = await fetch(`${base}/api/store`, { method: "PUT", headers: S, body: JSON.stringify({ upsert: [{ id: "smoke-1", brief: "hi" }], settings: { key: "k", model: "m" } }) });
  const got = await (await fetch(`${base}/api/store`, { headers: S })).json();
  check("store keeps a project and settings in files", put.status === 200 && got.projects?.[0]?.id === "smoke-1" && got.settings?.key === "k" && existsSync(path.join(scratch, "data", "projects", "smoke-1.json")));
  const evil = await fetch(`${base}/api/store`, { method: "PUT", headers: S, body: JSON.stringify({ upsert: [{ id: "../evil" }] }) });
  check("store refuses an id that leaves the folder", evil.status === 400 && !existsSync(path.join(scratch, "evil.json")));
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  check("server package present", Boolean(pkg.name));
} catch (err) {
  check("run", false, err instanceof Error ? err.message : String(err));
} finally {
  child.kill();
  rmSync(scratch, { recursive: true, force: true });
}
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
