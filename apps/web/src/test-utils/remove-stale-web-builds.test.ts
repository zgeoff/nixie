import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeStaleWebBuilds } from './remove-stale-web-builds';

async function setupTest() {
  const buildsDir = await mkdtemp(join(tmpdir(), 'nixie-web-builds-test-'));

  onTestFinished(() => rm(buildsDir, { recursive: true, force: true }));

  return { buildsDir };
}

test('it removes the build of a process that has exited, and keeps the build of a running one', async () => {
  const ctx = await setupTest();

  const exited = Bun.spawn(['true']);

  await exited.exited;
  await mkdir(join(ctx.buildsDir, String(exited.pid), 'server'), { recursive: true });
  await mkdir(join(ctx.buildsDir, String(process.pid), 'server'), { recursive: true });
  await removeStaleWebBuilds(ctx.buildsDir);

  const builds = await readdir(ctx.buildsDir);

  expect(builds).toStrictEqual([String(process.pid)]);
});

test('it leaves an entry alone whose name is no process ID', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.buildsDir, 'notes'));
  await removeStaleWebBuilds(ctx.buildsDir);

  const entries = await readdir(ctx.buildsDir);

  expect(entries).toStrictEqual(['notes']);
});

test('it removes nothing when no build has run yet', async () => {
  const ctx = await setupTest();

  const buildsDir = join(ctx.buildsDir, 'missing');

  await removeStaleWebBuilds(buildsDir);

  const exists = await Bun.file(buildsDir).exists();

  expect(exists).toBeFalse();
});
