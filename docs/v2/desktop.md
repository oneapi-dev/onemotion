# OneMotion for Windows (desktop)

## Why Electron, not Tauri

Tested, not assumed:

- Rendering is `@remotion/web-renderer` in Chromium (WebCodecs). Electron 44.9.0 ships Chromium 152 built with proprietary codecs. In a spike, its sandboxed renderer reported H.264 (hardware and software), AAC, VP9 and Opus encoders, and a full MP4 export through the real UI succeeded.
- The studio needs its Next.js server (LLM proxy, website reader, scene type-check with the TypeScript compiler). Electron runs it in a utility process with the Node it already ships. Tauri would need a separate Node sidecar plus WebView2, whose Chromium version and codecs vary per machine.
- One codebase: the desktop app is the web app's own production build.

Tauri's smaller installer (no bundled Chromium) does not offset a second runtime and per-machine codec drift.

## How it is put together

```
desktop/
  main.cjs            main process (no build step)
  package.json        name, version, license UNLICENSED, no dependencies
  electron-builder.yml
  assets/icon.png
  server/             staged by scripts/stage-desktop.mjs (gitignored)
scripts/
  stage-desktop.mjs   next build (standalone) + copy + checks
  desktop.mjs         run the shell from the checkout (dev / start)
  desktop-smoke.mjs   12 checks against the staged server
  benchmark*.{mjs,cjs}
src/proxy.ts          desktop-only request guard (no-op on the web)
```

1. `npm run desktop:build`: `next build` with `output: "standalone"` (only when `ONEMOTION_DESKTOP_BUILD=1`). It copies `.next/static` and `public/` (music, audio, samples) with links resolved, deletes local `.env` files, and fails on missing runtime files, browser source maps or key-like strings.
2. The main process picks a free loopback port and starts `server/server.js` with `utilityProcess.fork`. The server gets a minimal environment: no `NODE_OPTIONS`, plus a random 32-byte secret for this launch. It waits until the server answers, retries with a new port up to 3 times, and logs to `%APPDATA%/OneMotion/logs/server.log`.
3. The window loads `onemotion://app/`, a privileged custom scheme whose handler forwards each request to the server and adds the secret. The origin never changes between launches, so localStorage and IndexedDB (projects, settings, recorded voice, history) persist.
4. `src/proxy.ts` refuses any request without the secret, or addressed to a Host other than `127.0.0.1:<port>` (403). This covers other local programs and DNS rebinding.

## Security

- The window runs model-written scene code, so it gets no Node.js and **no preload bridge**: `sandbox`, `contextIsolation`, `nodeIntegration: false` and `webSecurity` are all on.
- Permissions are denied except clipboard writes and fullscreen. Navigation stays inside `onemotion://app`, `https` links open in the system browser, new windows and `<webview>` are refused.
- Downloads go through a save dialog that defaults to the Videos folder.
- Fuses (applied by electron-builder after packaging): `RunAsNode` off, `NODE_OPTIONS` off, `--inspect` off, cookie encryption on, embedded asar integrity on, load app only from asar, no extra file:// privileges. The packaged app was run with these on and worked.
- Limits:
  - asar integrity does not cover `resources/server` (extraResources).
  - In a per-user install, any program running as that user can modify the install folder.
  - Packaging does not hide JavaScript: the server bundle is readable. Keep secrets and entitlement logic server-side (`architecture.md`).

## Build an installer

```bash
npm run desktop:dist          # → dist-desktop/OneMotion Setup <version>.exe
npm run desktop:smoke         # checks the staged server
npm run desktop:start         # run the shell from the checkout on the staged server
npm run desktop:dev           # shell over `next dev` (ONEMOTION_DEV_URL, default http://localhost:3000)
```

Measured on this machine:
- Installer: 145 MB.
- `resources/server`: 85 MB.
- `app.asar`: only the main process.

electron-builder must run with `--projectDir desktop`. From the repo root it packs the root's `node_modules` (561 MB). It also drops a `node_modules` folder at the root of any copied source, which is why the server is copied as `server/**`.

VS Code terminals export `ELECTRON_RUN_AS_NODE=1`, which makes Electron start as plain Node. The scripts remove it.

## Not done

- **Code signing**: set `CSC_LINK`/`CSC_KEY_PASSWORD` (or Azure Trusted Signing) in CI. Unsigned builds trigger SmartScreen warnings.
- **Auto-update**: add `electron-updater` with a `publish` target. It verifies the sha512 in `latest.yml`. Signature checking needs `publisherName` and a signed build.
- **EULA page in the installer**: needs legal text (`nsis.license`).
- **Render queue / cancel-resume across restarts**: export runs in the window. Cancel works; an interrupted export restarts from zero.
- **Offline fonts**: Google Fonts are fetched at runtime.
- **Clean-VM install test.**
