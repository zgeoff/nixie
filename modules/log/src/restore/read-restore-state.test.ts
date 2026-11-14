import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localDataStorage } from '../writer/local-data-storage';
import { readRestoreState } from './read-restore-state';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-restore-state-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir };
}

test('it reads a data directory without the restore marker as no restore', async () => {
  const ctx = await setupTest();
  const state = await readRestoreState(localDataStorage.files, ctx.dataDir);

  expect(state).toStrictEqual({ state: 'none' });
});

test('it reads a data directory with the restore marker as a restore that is replacing', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), '');

  const state = await readRestoreState(localDataStorage.files, ctx.dataDir);

  expect(state).toStrictEqual({ state: 'replacing' });
});

test.each([
  ['text that is not JSON', 'half a mark'],
  ['JSON that fails the schema', '{"version":1,"recoveryID":"r1"}'],
  [
    'JSON with an unknown field',
    '{"version":1,"recoveryID":"r1","restoredAt":2,"backupTakenAt":1,"extra":true}',
  ],
])('it reads a marker holding %s as a restore that is replacing', async (_title, text) => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), text);

  const state = await readRestoreState(localDataStorage.files, ctx.dataDir);

  expect(state).toStrictEqual({ state: 'replacing' });
});

test('it reads a marker holding a pending restore as a restore that is holding, with its payload', async () => {
  const ctx = await setupTest();

  const pending = {
    version: 1,
    recoveryID: 'recovery-a',
    restoredAt: 2000,
    backupTakenAt: 1000,
  } as const;

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), JSON.stringify(pending));

  const state = await readRestoreState(localDataStorage.files, ctx.dataDir);

  expect(state).toStrictEqual({ state: 'holding', pending });
});
