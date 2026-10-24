import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWebBuildOnce } from '@heynixie/web/test-utils';

test('it builds the web server entry once and shares it', async () => {
  const paths = await Promise.all([runWebBuildOnce(), runWebBuildOnce()]);
  const built = await Bun.file(paths[0]).exists();

  expect(paths[1]).toBe(paths[0]);
  expect(paths[0]).toEndWith('/server/server.js');
  expect(built).toBeTrue();
});

test('it builds into a directory for its own process, so parallel test processes never share a build', async () => {
  const path = await runWebBuildOnce();

  expect(path).toBe(join(tmpdir(), 'nixie-web-builds', String(process.pid), 'server', 'server.js'));
});

test('it removes the build of a test process that has exited before it builds', async () => {
  const buildsDir = await mkdtemp(join(tmpdir(), 'nixie-web-builds-test-'));

  onTestFinished(() => rm(buildsDir, { recursive: true, force: true }));

  // the directory an exited test process left behind, named for its process ID as a build is
  const exited = Bun.spawn([process.execPath, '--version'], { stdout: 'ignore' });

  await exited.exited;
  await mkdir(join(buildsDir, String(exited.pid), 'server'), { recursive: true });

  const buildsBefore = await readdir(buildsDir);

  // the lane's limit stops at this process, so the child run takes it on its own command line
  const child = Bun.spawn(
    [
      process.execPath,
      'test',
      '--timeout=15000',
      join(import.meta.dir, 'run-web-build-once.test.ts'),
      '-t',
      'it builds the web server entry once and shares it',
    ],
    {
      cwd: import.meta.dir,
      env: { ...process.env, NIXIE_WEB_BUILDS_DIR: buildsDir },
      stderr: 'ignore',
      stdout: 'ignore',
    },
  );

  onTestFinished(() => {
    child.kill();
  });

  const exitCode = await child.exited;
  const buildsAfter = await readdir(buildsDir);

  expect(buildsBefore).toStrictEqual([String(exited.pid)]);
  expect(exitCode).toBe(0);
  expect(buildsAfter).toHaveLength(1);
  expect(buildsAfter).not.toContain(String(exited.pid));
});

// This cap still refuses Node's wasm trap handler reservation, and a lower one leaves some Node
// releases no room for their own heap. The lane's limit stops at this process, so the child run
// takes the same limit on its own command line.
test('it builds the web server entry under an address-space cap', async () => {
  const child = Bun.spawn(
    [
      'sh',
      '-c',
      'ulimit -v 12000000 && exec "$0" test --timeout=15000 "$1" -t "$2"',
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
});
