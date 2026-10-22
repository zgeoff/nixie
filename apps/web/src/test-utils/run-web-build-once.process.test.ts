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
});

// This cap still refuses Node's wasm trap handler reservation, and a lower one leaves some Node
// releases no room for their own heap. The lane's raised limit stops at this process, so the child
// run takes the same limit on its own command line.
test('it builds the web server entry under an address-space cap', async () => {
  const child = Bun.spawn(
    [
      'sh',
      '-c',
      'ulimit -v 12000000 && exec "$0" test --timeout=120000 "$1" -t "$2"',
      process.execPath,
      join(import.meta.dir, 'run-web-build-once.process.test.ts'),
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
});
