import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localDataStorage } from '../writer/local-data-storage';
import { removeRestoreMarker } from './remove-restore-marker';
import { writeRestoreState } from './write-restore-state';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-remove-restore-marker-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir };
}

test('it removes the marker of a finished restore', async () => {
  const ctx = await setupTest();

  await writeRestoreState(localDataStorage.files, ctx.dataDir, { state: 'replacing' });

  await writeRestoreState(localDataStorage.files, ctx.dataDir, {
    state: 'holding',
    pending: { version: 1, recoveryID: 'recovery-a', restoredAt: 2000, backupTakenAt: 1000 },
  });

  await removeRestoreMarker(ctx.dataDir);

  const files = await readdir(ctx.dataDir);

  expect(files).toStrictEqual([]);
});

test('it writes nothing when the marker is already gone', async () => {
  const ctx = await setupTest();

  await removeRestoreMarker(ctx.dataDir);

  const files = await readdir(ctx.dataDir);

  expect(files).toStrictEqual([]);
});

test('it refuses a marker of a restore that stopped', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), '');

  const [outcome] = await Promise.allSettled([removeRestoreMarker(ctx.dataDir)]);
  const files = await readdir(ctx.dataDir);

  expect(outcome.status).toBe('rejected');
  expect(files).toStrictEqual(['restore-incomplete']);
});
