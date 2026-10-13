// `npm run dev`: the sandbox runtime rebuilt on every change (esbuild watch)
// alongside the Next dev server, so a kit change reaches the sandbox without
// a manual build. Arguments go to `next dev` (e.g. -p 3200).
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (args) => spawn(process.execPath, args, { cwd: ROOT, stdio: "inherit" });

const sandbox = run([join(ROOT, "scripts", "build-sandbox.mjs"), "--watch"]);
const next = run([join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", ...process.argv.slice(2)]);

const stop = () => {
  sandbox.kill();
  next.kill();
};
next.on("exit", (code) => {
  sandbox.kill();
  process.exit(code ?? 0);
});
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
