import { onTestFinished } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findBrowserRun } from './find-browser-run';
import { removeExitedProcessDirs } from './remove-exited-process-dirs';

const builds: { web?: Promise<string> } = {};

// The browser lane builds the client once before its test processes start, and a build in each
// of them would run once per file.
export function runWebBuildOnce(): Promise<string> {
  const browserRun = findBrowserRun(process.env);

  builds.web ??= browserRun === null ? runBuild() : Promise.resolve(browserRun.webServerPath);

  return builds.web;
}

const webDir = join(import.meta.dir, '..', '..');

async function runBuild(): Promise<string> {
  // The parallel test run builds once in each worker process, and a build into the shared dist
  // directory deletes the hashed assets that another worker's server still loads. Bun's test
  // workers end without an exit event, so each build removes the builds of exited processes.
  const buildsDir = process.env['NIXIE_WEB_BUILDS_DIR'] ?? join(tmpdir(), 'nixie-web-builds');

  await removeExitedProcessDirs(buildsDir);

  const outDir = join(buildsDir, String(process.pid));

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // Node's wasm trap handler reserves more address space than a `ulimit -v` cap allows, and Vite
  // loads wasm.
  const nodeOptions = [process.env['NODE_OPTIONS'], '--disable-wasm-trap-handler'];

  const child = Bun.spawn(['bun', 'run', 'build', '--outDir', outDir], {
    cwd: webDir,
    env: { ...process.env, NODE_OPTIONS: nodeOptions.filter(Boolean).join(' ') },
    stderr: 'pipe',
    stdout: 'ignore',
  });

  onTestFinished(() => {
    child.kill();
  });

  // A full stderr pipe stops the build, so the run reads it while the build runs.
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);

  if (exitCode !== 0) {
    throw new Error(`the web build failed:\n${stderr}`);
  }

  return join(outDir, 'server', 'server.js');
}
