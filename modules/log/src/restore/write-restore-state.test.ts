import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localDataStorage } from '../writer/local-data-storage';
import { readRestoreState } from './read-restore-state';
import { writeRestoreState } from './write-restore-state';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-restore-state-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir };
}

test('it writes the restore marker when a restore starts replacing', async () => {
  const ctx = await setupTest();

  await writeRestoreState(localDataStorage.files, ctx.dataDir, { state: 'replacing' });

  const files = await readdir(ctx.dataDir);

  expect(files).toStrictEqual(['restore-incomplete']);
});

test('it keeps the restore marker when a restore starts again after one that stopped', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), '');
  await writeRestoreState(localDataStorage.files, ctx.dataDir, { state: 'replacing' });

  const files = await readdir(ctx.dataDir);

  expect(files).toStrictEqual(['restore-incomplete']);
});

test('it removes the restore marker when a restore finishes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), '');
  await writeRestoreState(localDataStorage.files, ctx.dataDir, { state: 'none' });

  const files = await readdir(ctx.dataDir);

  expect(files).toStrictEqual([]);
});

test('it renames a holding marker over the replacing marker, and leaves no second file', async () => {
  const ctx = await setupTest();

  const pending = {
    version: 1,
    recoveryID: 'recovery-a',
    restoredAt: 2000,
    backupTakenAt: 1000,
  } as const;

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), '');
  await writeRestoreState(localDataStorage.files, ctx.dataDir, { state: 'holding', pending });

  const files = await readdir(ctx.dataDir);
  const state = await readRestoreState(localDataStorage.files, ctx.dataDir);

  expect(files).toStrictEqual(['restore-incomplete']);
  expect(state).toStrictEqual({ state: 'holding', pending });
});

test('it leaves the replacing marker when it stops before the rename', async () => {
  const ctx = await setupTest();

  const pending = {
    version: 1,
    recoveryID: 'recovery-a',
    restoredAt: 2000,
    backupTakenAt: 1000,
  } as const;

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), '');

  const write = writeRestoreState(
    {
      ...localDataStorage.files,
      renameFile: () => Promise.reject(new Error('EIO: i/o error, rename')),
    },
    ctx.dataDir,
    { state: 'holding', pending },
  );

  await write.catch(() => {});

  const state = await readRestoreState(localDataStorage.files, ctx.dataDir);

  expect(write).rejects.toThrowWithMessage(Error, 'EIO: i/o error, rename');
  expect(state).toStrictEqual({ state: 'replacing' });
});

test('it refuses a move from no marker to holding', async () => {
  const ctx = await setupTest();

  const pending = {
    version: 1,
    recoveryID: 'recovery-a',
    restoredAt: 2000,
    backupTakenAt: 1000,
  } as const;

  const write = writeRestoreState(localDataStorage.files, ctx.dataDir, {
    state: 'holding',
    pending,
  });

  await write.catch(() => {});

  const files = await readdir(ctx.dataDir);

  expect(write).rejects.toThrowWithMessage(Error, /a restore never moves from none to holding/u);
  expect(files).toStrictEqual([]);
});

test('it moves from holding to replacing', async () => {
  const ctx = await setupTest();

  const pending = {
    version: 1,
    recoveryID: 'recovery-a',
    restoredAt: 2000,
    backupTakenAt: 1000,
  } as const;

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), JSON.stringify(pending));
  await writeRestoreState(localDataStorage.files, ctx.dataDir, { state: 'replacing' });

  const state = await readRestoreState(localDataStorage.files, ctx.dataDir);

  expect(state).toStrictEqual({ state: 'replacing' });
});

test('it fails before a restore moves on when the emptied holding marker cannot reach the disk', async () => {
  const ctx = await setupTest();

  const pending = {
    version: 1,
    recoveryID: 'recovery-a',
    restoredAt: 2000,
    backupTakenAt: 1000,
  } as const;

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), JSON.stringify(pending));

  const write = writeRestoreState(
    {
      ...localDataStorage.files,
      writeFileToDisk: () => Promise.reject(new Error('EIO: i/o error, fsync')),
    },
    ctx.dataDir,
    { state: 'replacing' },
  );

  await write.catch(() => {});

  expect(write).rejects.toThrowWithMessage(Error, 'EIO: i/o error, fsync');
});

test('it moves from holding to none', async () => {
  const ctx = await setupTest();

  const pending = {
    version: 1,
    recoveryID: 'recovery-a',
    restoredAt: 2000,
    backupTakenAt: 1000,
  } as const;

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), JSON.stringify(pending));
  await writeRestoreState(localDataStorage.files, ctx.dataDir, { state: 'none' });

  const files = await readdir(ctx.dataDir);

  expect(files).toStrictEqual([]);
});
