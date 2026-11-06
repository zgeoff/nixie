import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBackupSetDir } from './get-backup-set-dir';
import { localBackupFileReads } from './local-backup-file-reads';
import { readBackupSets } from './read-backup-sets';

async function setupTest() {
  const stagingDir = await mkdtemp(join(tmpdir(), 'nixie-set-dir-'));

  onTestFinished(() => rm(stagingDir, { recursive: true, force: true }));

  return { stagingDir };
}

test('it names the directory that the set reader lists as the set of a sequence', async () => {
  const ctx = await setupTest();

  await mkdir(getBackupSetDir(ctx.stagingDir, 42));

  const sets = await readBackupSets(localBackupFileReads, ctx.stagingDir);

  expect(sets).toStrictEqual([
    {
      sequence: 42,
      directory: getBackupSetDir(ctx.stagingDir, 42),
      hasMarker: false,
      hasReceipt: false,
    },
  ]);
});
