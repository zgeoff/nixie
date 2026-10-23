import { expect, onTestFinished, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWebBuildOnce } from './run-web-build-once';

test('it builds the web server entry once and shares it', async () => {
  const paths = await Promise.all([runWebBuildOnce(), runWebBuildOnce()]);
  const built = await Bun.file(paths[0]).exists();

  expect(paths[1]).toBe(paths[0]);
  expect(paths[0]).toEndWith('/server/server.js');
  expect(built).toBeTrue();
}, 120_000);

test('it builds into a temporary directory of its own, so parallel test processes never share a build', async () => {
  const path = await runWebBuildOnce();

  expect(path).toStartWith(`${tmpdir()}/nixie-web-build-`);
}, 120_000);

// This cap still refuses Node's wasm trap handler reservation, and a lower one leaves some Node
// releases no room for their own heap.
test('it builds the web server entry under an address-space cap', async () => {
  const child = Bun.spawn(
    [
      'sh',
      '-c',
      'ulimit -v 12000000 && exec "$0" test "$1" -t "$2"',
      process.execPath,
      join(import.meta.dir, 'run-web-build-once.test.ts'),
      'it builds the web server entry once and shares it',
    ],
    { cwd: import.meta.dir, stderr: 'pipe', stdout: 'ignore' },
  );

  onTestFinished(() => {
    child.kill();
  });

  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);

  expect(stderr).toInclude('\n 1 pass\n');
  expect(exitCode).toBe(0);
}, 120_000);
