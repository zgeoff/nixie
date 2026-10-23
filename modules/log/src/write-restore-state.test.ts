import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localDataStorage } from './local-data-storage';
import { writeRestoreState } from './write-restore-state';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-restore-state-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir };
}

test('it writes the restore marker when a restore starts replacing', async () => {
  const ctx = await setupTest();

  await writeRestoreState(localDataStorage.files, ctx.dataDir, 'replacing');

  const files = await readdir(ctx.dataDir);

  expect(files).toStrictEqual(['restore-incomplete']);
});

test('it keeps the restore marker when a restore starts again after one that stopped', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), '');
  await writeRestoreState(localDataStorage.files, ctx.dataDir, 'replacing');

  const files = await readdir(ctx.dataDir);

  expect(files).toStrictEqual(['restore-incomplete']);
});

test('it removes the restore marker when a restore finishes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), '');
  await writeRestoreState(localDataStorage.files, ctx.dataDir, 'none');

  const files = await readdir(ctx.dataDir);

  expect(files).toStrictEqual([]);
});
