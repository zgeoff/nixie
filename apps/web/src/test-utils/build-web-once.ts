import { join } from 'node:path';

const webDir = join(import.meta.dir, '..', '..');

// The one build of this test process, shared by every suite that runs the built server.
const builds: { web?: Promise<string> } = {};

// Builds the web client with Vite once per test process and resolves with the built server
// entry. The build is an immutable input, so the suites that run it share it.
export function buildWebOnce(): Promise<string> {
  builds.web ??= runBuild();

  return builds.web;
}

async function runBuild(): Promise<string> {
  const child = Bun.spawn(['bun', 'run', 'build'], { cwd: webDir, stderr: 'pipe', stdout: 'pipe' });
  const exitCode = await child.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(child.stderr).text();

    throw new Error(`the web build failed:\n${stderr}`);
  }

  return join(webDir, 'dist', 'server', 'server.js');
}
