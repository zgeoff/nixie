// Usage: bun run.ts <scenario> ; prints one JSON line of measurements.
// scenarios: headless-shell | headless-full | desktop-idle | desktop-scroll | desktop-vnc | desktop-cdp
import { chromium } from "playwright-core";
import { readFileSync, readdirSync, rmSync, mkdirSync } from "node:fs";

const scenario = process.argv[2]!;
const SETTLE_MS = 25_000, WINDOW_MS = 30_000;
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: "/opt/browsers", DISPLAY: ":1" };
const children: Bun.Subprocess[] = [];
const sh = (cmd: string[], e = env) => { const p = Bun.spawn(cmd, { env: e, stdout: "ignore", stderr: "ignore" }); children.push(p); return p; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const desktop = scenario.startsWith("desktop");
if (desktop) {
  sh(["Xvfb", ":1", "-screen", "0", "1280x800x24", "-nolisten", "tcp"]);
  await sleep(1000);
  sh(["openbox"]);
  sh(["xterm", "-geometry", "80x24+0+0", "-e", "sh", "-c", "while :; do date; sleep 5; done"]);
  await sleep(1000);
}
const headless = !desktop;
const full = scenario !== "headless-shell";
const dir = "/tmp/ud"; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir);
const args = ["--no-sandbox", "--disable-dev-shm-usage", ...(desktop ? ["--window-size=1280,800", "--window-position=0,0"] : [])];
const browser = await chromium.launch({
  headless,
  ...(full ? { channel: "chromium" } : {}),
  args,
});
const ctx = await browser.newContext({ viewport: desktop ? null : { width: 1280, height: 800 } });
const p1 = await ctx.newPage(); await p1.goto("https://example.com", { waitUntil: "load" });
const p2 = await ctx.newPage(); await p2.goto("https://www.bbc.com/news", { waitUntil: "load", timeout: 60000 });
await p2.bringToFront();

let stopScroll = false, frames = 0;
if (scenario === "desktop-vnc" || scenario === "desktop-scroll" || scenario === "desktop-cdp") {
  (async () => { let dir = 1; while (!stopScroll) { await p2.mouse.move(600, 400).catch(() => {}); await p2.mouse.wheel(0, 150 * dir).catch(() => {}); await sleep(60);
    if (Math.random() < 0.03) dir *= -1; } })();
}
if (scenario === "desktop-cdp") {
  const s = await ctx.newCDPSession(p2);
  s.on("Page.screencastFrame", (f: any) => { frames++; s.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); });
  await s.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 1280, maxHeight: 800 });
}
if (scenario === "desktop-vnc") {
  sh(["x11vnc", "-display", ":1", "-forever", "-shared", "-nopw", "-localhost", "-rfbport", "5900", "-quiet"]);
  await sleep(1500);
  // client on its own display :2, so its cost is separable
  sh(["Xvfb", ":2", "-screen", "0", "1280x800x24", "-nolisten", "tcp"]);
  await sleep(1000);
  sh(["vncviewer", "-FullScreen=0", "localhost:5900"], { ...env, DISPLAY: ":2" });
}
await sleep(SETTLE_MS);

const clk = 100; // CLK_TCK
const procs = () => readdirSync("/proc").filter((d) => /^\d+$/.test(d)).map((pid) => {
  try {
    const st = readFileSync(`/proc/${pid}/stat`, "utf8"); const comm = st.slice(st.indexOf("(") + 1, st.lastIndexOf(")"));
    const f = st.slice(st.lastIndexOf(")") + 2).split(" "); const ticks = +f[11]! + +f[12]!;
    if (+f[21]! === 0) throw 0; // kernel thread / no memory
    const rss = +readFileSync(`/proc/${pid}/statm`, "utf8").split(" ")[1]! * 4;
    let pss = 0; try { pss = +/Pss:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/smaps_rollup`, "utf8"))![1]!; } catch {}
    return { pid, comm, ticks, rss, pss };
  } catch { return null; }
}).filter(Boolean) as { pid: string; comm: string; ticks: number; rss: number; pss: number }[];
const group = (c: string) => /chrom|headless_shell|chrome_crashpad/.test(c) ? "chromium" : c === "bun" ? "driver(bun)" : c.startsWith("Xvfb") ? "Xvfb" : c === "vncviewer" || c === "Xtigervnc" ? "vnc-client" : c;
const stat = () => { const a = readFileSync("/proc/stat", "utf8").split("\n")[0]!.split(/\s+/).slice(1).map(Number); return { tot: a.reduce((x, y) => x + y, 0), idle: a[3]! + a[4]! }; };
const mem = () => { const m = readFileSync("/proc/meminfo", "utf8"); const g = (k: string) => +new RegExp(k + ":\\s+(\\d+)").exec(m)![1]!; return { used: (g("MemTotal") - g("MemAvailable")) / 1024, free: g("MemFree") / 1024, cache: g("Cached") / 1024, shmem: g("Shmem") / 1024, anon: g("AnonPages") / 1024 }; };

const a = procs(), s0 = stat(), t0 = Date.now();
const memSamples: number[] = [];
let peak = 0;
for (let i = 0; i < WINDOW_MS / 2000; i++) { await sleep(2000); const m = mem().used; memSamples.push(m); peak = Math.max(peak, m); }
const b = procs(), s1 = stat(), dt = (Date.now() - t0) / 1000;
const m = mem();
const g: Record<string, { rssMiB: number; pssMiB: number; cpuPct: number; n: number }> = {};
for (const p of b) {
  const k = group(p.comm); const prev = a.find((x) => x.pid === p.pid);
  const x = (g[k] ??= { rssMiB: 0, pssMiB: 0, cpuPct: 0, n: 0 });
  x.rssMiB += p.rss / 1024; x.pssMiB += p.pss / 1024; x.n++;
  x.cpuPct += prev ? ((p.ticks - prev.ticks) / clk / dt) * 100 : 0;
}
for (const k in g) { const x = g[k]!; x.rssMiB = +x.rssMiB.toFixed(0); x.pssMiB = +x.pssMiB.toFixed(0); x.cpuPct = +x.cpuPct.toFixed(1); }
const ds = s1.tot - s0.tot, di = s1.idle - s0.idle;
const keep = ["chromium", "Xvfb", "openbox", "xterm", "x11vnc", "driver(bun)", "vnc-client"];
const out = {
  scenario,
  usedMiB: +m.used.toFixed(0), usedPeakMiB: +peak.toFixed(0), anonMiB: +m.anon.toFixed(0), shmemMiB: +m.shmem.toFixed(0),
  machineBusyPctOfAllCpus: +(((ds - di) / ds) * 100).toFixed(1),
  groups: Object.fromEntries(Object.entries(g).filter(([k]) => keep.includes(k))),
  cdpFrames: frames,
};
console.log(JSON.stringify(out));
stopScroll = true;
await browser.close().catch(() => {});
for (const c of children) c.kill();
process.exit(0);
