import { onTestFinished } from 'bun:test';
import { join } from 'node:path';

const builds: { web?: Promise<string> } = {};

export function runWebBuildOnce(): Promise<string> {
  builds.web ??= runBuild();

  return builds.web;
}

const webDir = join(import.meta.dir, '..', '..');

async function runBuild(): Promise<string> {
  // Node's wasm trap handler reserves more address space than a `ulimit -v` cap allows, and Vite
  // loads wasm.
  const nodeOptions = [process.env['NODE_OPTIONS'], '--disable-wasm-trap-handler'];

  const child = Bun.spawn(['bun', 'run', 'build'], {
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

  return join(webDir, 'dist', 'server', 'server.js');
}
