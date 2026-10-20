import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { runWebBuildOnce } from './run-web-build-once';

test('it builds the web server entry once and shares it', async () => {
  const paths = await Promise.all([runWebBuildOnce(), runWebBuildOnce()]);

  expect(paths).toStrictEqual([
    join(import.meta.dir, '..', '..', 'dist', 'server', 'server.js'),
    join(import.meta.dir, '..', '..', 'dist', 'server', 'server.js'),
  ]);

  const built = await Bun.file(
    join(import.meta.dir, '..', '..', 'dist', 'server', 'server.js'),
  ).exists();

  expect(built).toBeTrue();
}, 120_000);

// the child runs the shared-build test above under the cap, and its title filter keeps it from
// running this test again; the cap still refuses the wasm trap handler's reservation, and a lower
// one leaves some Node releases no room for their own heap
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
