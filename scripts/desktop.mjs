// Runs the desktop shell from this checkout.
//   node scripts/desktop.mjs dev     the window on a running `next dev` (ONEMOTION_DEV_URL, default http://localhost:3000)
//   node scripts/desktop.mjs start   the window on the staged server (npm run desktop:build first)
// Editors built on Electron (VS Code) export ELECTRON_RUN_AS_NODE to their terminals, which would make
// Electron start as plain Node; it is removed here.
import { spawn } from "node:child_process";
import path from "node:path";
import electron from "electron";

const mode = process.argv[2] ?? "start";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (mode === "dev") env.ONEMOTION_DEV_URL ??= "http://localhost:3000";
else delete env.ONEMOTION_DEV_URL;

const child = spawn(String(electron), [path.join(process.cwd(), "desktop", "main.cjs")], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
