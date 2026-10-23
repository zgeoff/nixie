import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localDataStorage } from './local-data-storage';
import { readRestoreState } from './read-restore-state';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-restore-state-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir };
}

test('it reads a data directory without the restore marker as no restore', async () => {
  const ctx = await setupTest();
  const state = await readRestoreState(localDataStorage.files, ctx.dataDir);

  expect(state).toBe('none');
});

test('it reads a data directory with the restore marker as a restore that is replacing', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), '');

  const state = await readRestoreState(localDataStorage.files, ctx.dataDir);

  expect(state).toBe('replacing');
});
