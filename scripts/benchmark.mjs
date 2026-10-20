// Export benchmark on this machine, in the desktop runtime (Electron) over the
// production server: npm run desktop:build, then npm run bench.
// Each workload (an example film) is exported once per render profile through
// the real UI; the report gives the time, the realtime factor, the app's peak
// memory, its average CPU (percent of one core, summed over processes) and
// the file size. Results go to stdout and docs/v2/benchmarks/<date>.json.
// Env: BENCH_PROFILES=eco,balanced,quality,max  BENCH_WORKLOADS=pattern,gateway
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import electron from "electron";

const ROOT = process.cwd();
const port = await new Promise((r) => {
  const s = net.createServer().listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => r(p));
  });
});
const server = spawn(process.execPath, ["server.js"], { cwd: path.join(ROOT, "desktop", "server"), env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", ONEMOTION_DESKTOP_SECRET: "" }, stdio: "ignore" });
const url = `http://127.0.0.1:${port}/`;
for (let i = 0; ; i++) {
  try {
    await fetch(url);
    break;
  } catch {
    if (i > 150) throw new Error("the staged server did not start: run npm run desktop:build first");
    await new Promise((r) => setTimeout(r, 200));
  }
}

const env = { ...process.env, BENCH_URL: url };
delete env.ELECTRON_RUN_AS_NODE;
let out = "";
const child = spawn(String(electron), [path.join(ROOT, "scripts", "benchmark-main.cjs")], { env, stdio: ["ignore", "pipe", "inherit"] });
child.stdout.on("data", (d) => (out += d));
const code = await new Promise((r) => child.on("exit", r));
server.kill();
const line = out.split("\n").find((l) => l.startsWith("BENCH "));
if (!line) {
  console.error(`The benchmark produced no report (exit ${code}).`);
  process.exit(1);
}
const report = { date: new Date().toISOString(), ...JSON.parse(line.slice(6)) };
const dir = path.join(ROOT, "docs", "v2", "benchmarks");
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${report.date.slice(0, 16).replace(/[:T]/g, "-")}.json`);
writeFileSync(file, JSON.stringify(report, null, 2));
console.table(report.results.map((r) => ({ workload: r.workload, profile: r.profile, film: r.filmSeconds ? `${r.filmSeconds.toFixed(1)}s` : "", seconds: r.seconds, "x realtime": r.realtimeFactor ?? "", "peak MB": r.peakAppMemoryMB, "cpu %": r.avgCpuPercentAllCores, MB: r.bytes ? (r.bytes / 1e6).toFixed(2) : "", size: r.width ? `${r.width}x${r.height}` : "", error: r.error ?? "" })));
console.log(`Machine: ${JSON.stringify(report.machine)}\nSaved ${path.relative(ROOT, file)}`);
