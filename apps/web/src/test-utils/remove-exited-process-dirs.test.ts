import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeExitedProcessDirs } from './remove-exited-process-dirs';

async function setupTest() {
  const parentDir = await mkdtemp(join(tmpdir(), 'nixie-process-dirs-test-'));

  onTestFinished(() => rm(parentDir, { recursive: true, force: true }));

  return { parentDir };
}

test('it removes the folder of a process that has exited, and keeps the folder of a running one', async () => {
  const ctx = await setupTest();

  const exited = Bun.spawn(['true']);

  await exited.exited;
  await mkdir(join(ctx.parentDir, String(exited.pid), 'server'), { recursive: true });
  await mkdir(join(ctx.parentDir, String(process.pid), 'server'), { recursive: true });
  await removeExitedProcessDirs(ctx.parentDir);

  const entries = await readdir(ctx.parentDir);

  expect(entries).toStrictEqual([String(process.pid)]);
});

test('it never removes an entry whose name is no process ID', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.parentDir, 'notes'));
  await removeExitedProcessDirs(ctx.parentDir);

  const entries = await readdir(ctx.parentDir);

  expect(entries).toStrictEqual(['notes']);
});

test('it removes nothing when the parent folder does not exist yet', async () => {
  const ctx = await setupTest();

  const parentDir = join(ctx.parentDir, 'missing');

  await removeExitedProcessDirs(parentDir);

  const exists = await Bun.file(parentDir).exists();

  expect(exists).toBeFalse();
});
