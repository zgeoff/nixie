import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { claimBackupLock } from './claim-backup-lock';
import { localDataStorage } from './local-data-storage';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-backup-lock-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir };
}

test('it lets two backups share the lock, through a lock file in the data directory', async () => {
  const ctx = await setupTest();
  const first = await claimBackupLock(localDataStorage, ctx.dataDir, 'shared');

  onTestFinished(() => {
    first?.release();
  });

  const second = await claimBackupLock(localDataStorage, ctx.dataDir, 'shared');

  onTestFinished(() => {
    second?.release();
  });

  const files = await readdir(ctx.dataDir);

  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(files).toStrictEqual(['backup.lock']);
});

test('it refuses a restore while a backup holds the lock', async () => {
  const ctx = await setupTest();
  const backup = await claimBackupLock(localDataStorage, ctx.dataDir, 'shared');

  invariant(backup);

  onTestFinished(() => {
    backup.release();
  });

  const restore = await claimBackupLock(localDataStorage, ctx.dataDir, 'exclusive');

  expect(restore).toBeNull();
});

test('it refuses a backup while a restore holds the lock', async () => {
  const ctx = await setupTest();
  const restore = await claimBackupLock(localDataStorage, ctx.dataDir, 'exclusive');

  invariant(restore);

  onTestFinished(() => {
    restore.release();
  });

  const backup = await claimBackupLock(localDataStorage, ctx.dataDir, 'shared');

  expect(backup).toBeNull();
});
