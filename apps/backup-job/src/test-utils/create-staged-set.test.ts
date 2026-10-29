import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupSetManifestSchema, parseBackupFile, readBackupSets } from '@heynixie/wire';
import { createStagedSet } from './create-staged-set';

async function setupTest() {
  const stagingDir = await mkdtemp(join(tmpdir(), 'nixie-staged-set-'));

  onTestFinished(() => rm(stagingDir, { recursive: true, force: true }));

  return { stagingDir };
}

test('it writes a complete set whose manifest parses and records the size of each copy', async () => {
  const ctx = await setupTest();

  const directory = await createStagedSet({
    stagingDir: ctx.stagingDir,
    sequence: 3,
    kind: 'forget',
    isComplete: true,
  });

  const text = await Bun.file(join(directory, 'manifest.json')).text();
  const sets = await readBackupSets(ctx.stagingDir);

  expect(parseBackupFile(text, backupSetManifestSchema)).toStrictEqual({
    value: {
      format: 1,
      kind: 'forget',
      sequence: 3,
      stagedAt: 1_798_761_600_000,
      copies: [
        {
          name: 'nixie.db',
          bytes: 18,
          sha256: new Bun.CryptoHasher('sha256').update('nixie.db of set 3\n').digest('hex'),
        },
        {
          name: 'keys.db',
          bytes: 17,
          sha256: new Bun.CryptoHasher('sha256').update('keys.db of set 3\n').digest('hex'),
        },
      ],
    },
  });

  expect(sets).toStrictEqual([{ sequence: 3, directory, hasMarker: true, hasReceipt: false }]);
});

test('it leaves out the manifest and the marker of a set that stopped part way', async () => {
  const ctx = await setupTest();

  const directory = await createStagedSet({
    stagingDir: ctx.stagingDir,
    sequence: 1,
    kind: 'scheduled',
    isComplete: false,
  });

  const names = await readdir(directory);

  expect(names).toIncludeSameMembers(['nixie.db', 'keys.db']);
});
