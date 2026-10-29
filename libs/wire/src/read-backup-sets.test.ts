import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localBackupFileReads } from './local-backup-file-reads';
import { readBackupSets } from './read-backup-sets';

async function setupTest() {
  const stagingDir = await mkdtemp(join(tmpdir(), 'nixie-staging-'));

  onTestFinished(() => rm(stagingDir, { recursive: true, force: true }));

  return { stagingDir };
}

test('it lists the sets in sequence order, with whether each holds its marker and its receipt', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.stagingDir, '000000000010'));
  await writeFile(join(ctx.stagingDir, '000000000010', 'complete'), '');
  await mkdir(join(ctx.stagingDir, '000000000009'));
  await writeFile(join(ctx.stagingDir, '000000000009', 'complete'), '');
  await writeFile(join(ctx.stagingDir, '000000000009', 'receipt.json'), '{}');
  await mkdir(join(ctx.stagingDir, '000000000011'));

  const sets = await readBackupSets(localBackupFileReads, ctx.stagingDir);

  expect(sets).toStrictEqual([
    {
      sequence: 9,
      directory: join(ctx.stagingDir, '000000000009'),
      hasMarker: true,
      hasReceipt: true,
    },
    {
      sequence: 10,
      directory: join(ctx.stagingDir, '000000000010'),
      hasMarker: true,
      hasReceipt: false,
    },
    {
      sequence: 11,
      directory: join(ctx.stagingDir, '000000000011'),
      hasMarker: false,
      hasReceipt: false,
    },
  ]);
});

test('it leaves out a name that is no set', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.stagingDir, '.000000000012.tmp'));
  await writeFile(join(ctx.stagingDir, 'notes.txt'), 'kept by the operator');

  const sets = await readBackupSets(localBackupFileReads, ctx.stagingDir);

  expect(sets).toStrictEqual([]);
});

test('it reads a staging directory that does not exist yet as no sets', async () => {
  const ctx = await setupTest();
  const sets = await readBackupSets(localBackupFileReads, join(ctx.stagingDir, 'missing'));

  expect(sets).toStrictEqual([]);
});
