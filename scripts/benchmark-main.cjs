// Electron side of the export benchmark (scripts/benchmark.mjs starts it):
// loads the studio from BENCH_URL, and for each workload and render profile
// exports through the real UI, sampling the app's memory and CPU while it
// runs. Prints one JSON report on stdout.
const { app, BrowserWindow } = require("electron");
const os = require("node:os");

const URL_ = process.env.BENCH_URL;
const PROFILES = (process.env.BENCH_PROFILES || "eco,balanced,quality,max").split(",");
const WORKLOADS = (process.env.BENCH_WORKLOADS || "pattern,gateway").split(",");

app.whenReady().then(async () => {
  const gpu = await app.getGPUInfo("basic").catch(() => null);
  const machine = {
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model.trim(),
    logicalCpus: os.cpus().length,
    ramGB: Math.round(os.totalmem() / 1e9),
    freeRamGB: Math.round(os.freemem() / 1e9),
    gpu: gpu?.gpuDevice?.map((d) => `${d.vendorId}:${d.deviceId}${d.active ? " (active)" : ""}`).join(", ") ?? "unknown",
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  };
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  // A hidden window still plays the preview's sound: the benchmark runs silent.
  win.webContents.setAudioMuted(true);
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const results = [];
  for (const workload of WORKLOADS) {
    for (const profile of PROFILES) {
      await win.loadURL(URL_);
      const seeded = await js(`(async () => {
        const ex = await (await fetch("/api/scene/example?name=${workload}")).json();
        if (!ex.files) return "no example";
        const c = await (await fetch("/api/scene/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: ex.files }) })).json();
        if (!c.ok) return "check failed: " + c.errors.slice(0, 2).join("; ");
        const spec = { ...ex.film, track: "advertime", score: { genre: "corporate-pop", bpm: 120, key: "C", mode: "major", chords: [], energy: [], moments: [], seed: 1 } };
        const concept = { title: "${workload}", language: "en", angle: "", style: "", metaphor: "", world: "", camera: "", components: [], typography: { display: "Space Grotesk", text: "Inter", mono: null }, palette: { bg: "#F4F2EC", ink: "#151515", accent: "#FF4F1F", support: "#2F6BFF" }, look: {}, brand: { name: "Bench", url: "" }, beats: spec.beats, score: spec.score, music: "", voiceover: false, facts: [], whyDifferent: "" };
        const film = { concept, spec, files: ex.files, modules: c.modules, status: "done", summary: "", spend: { input: 0, output: 0, cached: 0, usd: 0 }, log: [], reviews: [] };
        localStorage.setItem("oneapi-motion:projects", JSON.stringify([{ id: "bench", createdAt: "", brief: "bench", website: "", format: "landscape", tone: "auto", site: null, film }]));
        localStorage.setItem("oneapi-motion:settings", JSON.stringify({ key: "", model: "", renderProfile: "${profile}" }));
        return "ok";
      })()`);
      if (seeded !== "ok") {
        results.push({ workload, profile, error: seeded });
        continue;
      }
      await win.loadURL(URL_);
      let peakMB = 0;
      let cpuSum = 0;
      let cpuN = 0;
      const sampler = setInterval(() => {
        const m = app.getAppMetrics();
        peakMB = Math.max(peakMB, m.reduce((a, p) => a + p.memory.workingSetSize, 0) / 1024);
        cpuSum += m.reduce((a, p) => a + p.cpu.percentCPUUsage, 0);
        cpuN++;
      }, 250);
      const t0 = Date.now();
      const r = await js(`new Promise((resolve) => {
        const start = Date.now();
        const go = () => {
          const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Export");
          if (!b || b.disabled) return Date.now() - start > 60000 ? resolve({ error: "export button not ready" }) : setTimeout(go, 300);
          b.click();
          const wait = () => {
            const a = [...document.querySelectorAll("a")].find((x) => /^Download/.test(x.textContent.trim()));
            const err = [...document.querySelectorAll(".notice")].map((n) => n.textContent).join(" ");
            if (a)
              return fetch(a.href)
                .then((res) => res.blob())
                .then((blob) => {
                  // The real output size, read back from the file.
                  const v = document.createElement("video");
                  v.muted = true;
                  v.onloadedmetadata = () => resolve({ bytes: blob.size, name: a.getAttribute("download"), width: v.videoWidth, height: v.videoHeight, duration: Math.round(v.duration * 100) / 100 });
                  v.onerror = () => resolve({ bytes: blob.size, name: a.getAttribute("download") });
                  v.src = URL.createObjectURL(blob);
                });
            if (err) return resolve({ error: err });
            if (Date.now() - start > 900000) return resolve({ error: "timeout" });
            setTimeout(wait, 200);
          };
          wait();
        };
        go();
      })`);
      clearInterval(sampler);
      const seconds = (Date.now() - t0) / 1000;
      // The film's length, from the timeline's total timecode ("/ 00:10.00").
      const total = await js(`(() => { const m = /([0-9]+):([0-9]+)[.]([0-9]+)/.exec(document.querySelector(".timecode-total")?.textContent ?? ""); return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 30 : null; })()`);
      results.push({ workload, profile, filmSeconds: total, seconds: Math.round(seconds * 10) / 10, realtimeFactor: total ? Math.round((seconds / total) * 100) / 100 : null, peakAppMemoryMB: Math.round(peakMB), avgCpuPercentAllCores: cpuN ? Math.round(cpuSum / cpuN) : null, ...r });
      process.stderr.write(`${workload}/${profile}: ${JSON.stringify(results[results.length - 1])}\n`);
    }
  }
  process.stdout.write(`BENCH ${JSON.stringify({ machine, results })}\n`);
  app.quit();
});
