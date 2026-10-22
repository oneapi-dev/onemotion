// OneMotion for Windows: the studio's own server (Next.js, standalone) in a
// utility process on a loopback port, and a window that reaches it through
// a private scheme (onemotion://app). Rendering happens in the window, on
// this machine, exactly as in the browser edition.
//
// Security model: the window runs untrusted, model-written scene code, so it
// gets no Node.js and no preload bridge at all (sandboxed, context isolated).
// The server only answers requests carrying this launch's secret, which only
// this process adds. Navigation stays inside the app; links open in the
// person's browser; permissions are denied except clipboard writes.

const { app, BrowserWindow, Menu, dialog, net, protocol, session, shell, utilityProcess } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const tcp = require("node:net");

const SCHEME = "onemotion";
const ORIGIN = `${SCHEME}://app`;
// Development: point the window at `next dev` instead of the bundled server.
const DEV_URL = process.env.ONEMOTION_DEV_URL || "";

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

const secret = crypto.randomBytes(32).toString("hex");
let server = null;
let port = 0;
let quitting = false;
let win = null;

const logFile = () => path.join(app.getPath("logs"), "server.log");
function log(line) {
  try {
    fs.mkdirSync(app.getPath("logs"), { recursive: true });
    fs.appendFileSync(logFile(), `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Logging never stops the app.
  }
}

/** A free loopback port (the OS picks one; a lost race is retried by the caller). */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = tcp.createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port: p } = s.address();
      s.close(() => resolve(p));
    });
  });
}

const serverDir = () => (app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "server"));

/** The environment the server gets: only what it needs, never the shell's (no NODE_OPTIONS, no debugger flags). */
function serverEnv(p) {
  const keep = ["SystemRoot", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PATH", "ONEAPI_BASE_URL", "ONEAPI_CATALOG_URL"];
  const env = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  // The studio keeps projects in Documents/OneMotion; Windows may have moved Documents (OneDrive), which only Electron can ask.
  try {
    env.ONEMOTION_DOCUMENTS = app.getPath("documents");
  } catch {
    // The server falls back to the home folder's Documents.
  }
  return { ...env, NODE_ENV: "production", PORT: String(p), HOSTNAME: "127.0.0.1", NEXT_TELEMETRY_DISABLED: "1", ONEMOTION_DESKTOP_SECRET: secret };
}

async function waitForServer(p, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await net.fetch(`http://127.0.0.1:${p}/api/catalog`, { headers: { "x-onemotion-desktop": secret } });
      if (res.status < 500) return true;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function startServer() {
  const dir = serverDir();
  const entry = path.join(dir, "server.js");
  if (!fs.existsSync(entry)) throw new Error(`The studio server is missing (${entry}). Reinstall OneMotion.`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    port = await freePort();
    server = utilityProcess.fork(entry, [], { cwd: dir, serviceName: "OneMotion server", stdio: "pipe", env: serverEnv(port) });
    server.stdout?.on("data", (d) => log(`[out] ${String(d).trimEnd()}`));
    server.stderr?.on("data", (d) => log(`[err] ${String(d).trimEnd()}`));
    const exited = new Promise((r) => server.once("exit", (code) => r(code)));
    const ready = await Promise.race([waitForServer(port, 30_000), exited.then(() => false)]);
    if (ready) {
      server.once("exit", (code) => {
        log(`server exited with ${code}`);
        if (!quitting) {
          dialog.showErrorBox("OneMotion stopped", `The studio's server stopped unexpectedly (code ${code}). Your projects are saved; restart OneMotion. Details: ${logFile()}`);
          app.quit();
        }
      });
      log(`server ready on 127.0.0.1:${port}`);
      return;
    }
    log(`server did not start on port ${port} (attempt ${attempt})`);
    server.kill();
  }
  throw new Error(`The studio server did not start. Details: ${logFile()}`);
}

/** Every onemotion://app request goes to the local server with this launch's secret. */
function routeScheme() {
  protocol.handle(SCHEME, async (req) => {
    const u = new URL(req.url);
    if (u.host !== "app") return new Response("Not found", { status: 404 });
    const headers = new Headers(req.headers);
    headers.set("x-onemotion-desktop", secret);
    const res = await net.fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`, { method: req.method, headers, body: req.body, duplex: "half", redirect: "manual" });
    // A redirect the server writes for its own address stays inside the app.
    const loc = res.headers.get("location");
    if (loc && loc.startsWith(`http://127.0.0.1:${port}`)) {
      const h = new Headers(res.headers);
      h.set("location", ORIGIN + loc.slice(`http://127.0.0.1:${port}`.length));
      return new Response(res.body, { status: res.status, headers: h });
    }
    return res;
  });
}

function lockDown() {
  const allowed = new Set(["clipboard-sanitized-write", "fullscreen"]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  // Exports land where the person chooses, defaulting to their Videos folder.
  session.defaultSession.on("will-download", (_e, item) => {
    const name = item.getFilename().replace(/[^\w.\- ]+/g, "_") || "onemotion.mp4";
    item.setSaveDialogOptions({ title: "Save the video", defaultPath: path.join(app.getPath("videos"), name), filters: [{ name: "Video", extensions: ["mp4", "webm"] }, { name: "Project", extensions: ["json"] }] });
  });
}

const home = () => (DEV_URL || `${ORIGIN}/`);
const inside = (url) => (DEV_URL ? url.startsWith(DEV_URL) : url.startsWith(`${ORIGIN}/`) || url === ORIGIN);

app.on("web-contents-created", (_e, contents) => {
  contents.on("will-navigate", (e, url) => {
    if (inside(url)) return;
    e.preventDefault();
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (e) => e.preventDefault());
});

function splash() {
  const s = new BrowserWindow({ width: 420, height: 240, frame: false, resizable: false, show: false, backgroundColor: "#f5f3ee", webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#f5f3ee;color:#17150f;font:600 15px system-ui,sans-serif"><div style="text-align:center"><div style="font-size:26px;font-weight:700;letter-spacing:-0.02em">OneMotion</div><div style="margin-top:10px;color:#4b4740;font-weight:500">Starting the studio…</div></div></body>`;
  void s.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  s.once("ready-to-show", () => s.show());
  return s;
}

async function boot() {
  lockDown();
  Menu.setApplicationMenu(null);
  const s = DEV_URL ? null : splash();
  try {
    if (!DEV_URL) {
      routeScheme();
      await startServer();
    }
  } catch (err) {
    s?.destroy();
    dialog.showErrorBox("OneMotion could not start", err instanceof Error ? err.message : String(err));
    app.quit();
    return;
  }
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: "OneMotion",
    backgroundColor: "#f5f3ee",
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false },
  });
  win.once("ready-to-show", () => {
    s?.destroy();
    win.show();
  });
  await win.loadURL(home());
}

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.on("before-quit", () => {
  quitting = true;
  server?.kill();
});

app.on("window-all-closed", () => app.quit());

app.whenReady().then(boot);
