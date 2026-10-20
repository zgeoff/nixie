import { onTestFinished } from 'bun:test';
import { join } from 'node:path';

// The one build of this test process, shared by every suite that runs the built server.
const builds: { web?: Promise<string> } = {};

// Builds the web client with Vite once per test process and resolves with the built server
// entry. The build is an immutable input, so the suites that run it share it.
export function runWebBuildOnce(): Promise<string> {
  builds.web ??= runBuild();

  return builds.web;
}

const webDir = join(import.meta.dir, '..', '..');

async function runBuild(): Promise<string> {
  const child = Bun.spawn(['bun', 'run', 'build'], { cwd: webDir, stderr: 'pipe', stdout: 'pipe' });

  // a build that outlives the test that started it stops with that test, which failed on it
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
