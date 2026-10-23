import { onTestFinished } from 'bun:test';
import { rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const builds: { web?: Promise<string> } = {};

export function runWebBuildOnce(): Promise<string> {
  builds.web ??= runBuild();

  return builds.web;
}

const webDir = join(import.meta.dir, '..', '..');

async function runBuild(): Promise<string> {
  // The parallel test run builds once in each worker process, and a build into the shared dist
  // directory deletes the hashed assets that another worker's server still loads.
  const outDir = await mkdtemp(join(tmpdir(), 'nixie-web-build-'));

  process.once('exit', () => {
    rmSync(outDir, { recursive: true, force: true });
  });

  // Node's wasm trap handler reserves more address space than a `ulimit -v` cap allows, and Vite
  // loads wasm.
  const nodeOptions = [process.env['NODE_OPTIONS'], '--disable-wasm-trap-handler'];

  const child = Bun.spawn(['bun', 'run', 'build', '--outDir', outDir], {
    cwd: webDir,
    env: { ...process.env, NODE_OPTIONS: nodeOptions.filter(Boolean).join(' ') },
    stderr: 'pipe',
    stdout: 'pipe',
  });

  onTestFinished(() => {
    child.kill();
  });

  const exitCode = await child.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(child.stderr).text();

    throw new Error(`the web build failed:\n${stderr}`);
  }

  return join(outDir, 'server', 'server.js');
}
