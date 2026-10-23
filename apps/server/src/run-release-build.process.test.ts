import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-release-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { outdir: join(directory, 'out') };
}

test('it exits 0 and writes the server and its SQLite worker', async () => {
  const ctx = await setupTest();

  const build = Bun.spawnSync([
    process.execPath,
    join(import.meta.dir, 'run-release-build.ts'),
    ctx.outdir,
  ]);

  expect(build.exitCode).toBe(0);

  expect(build.stdout.toString()).toBe(
    'the release bundle holds main.js, sqlite-worker.js, with no test-build ID\n',
  );
});
