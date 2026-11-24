import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { localDataStorage, withWriteTransaction } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { backupFloorSchema, parseBackupFile } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { writeBackupFloor } from './write-backup-floor';
import { writeSnapshotSet } from './write-snapshot-set';

async function setupTest() {
  const log = await startTestLog();

  const context = { writer: log.writer, storage: localDataStorage };

  return {
    ...log,
    seed: buildSeeder({ log: log.log, context }),
    stage: () => writeSnapshotSet(context, 'scheduled'),
    writeFloor: () => withWriteTransaction(log.writer, (tx) => writeBackupFloor(context, tx)),
    readFloor: async () => {
      const text = await Bun.file(join(log.dataDir, 'backup', 'floor.json')).text();

      return parseBackupFile(text, backupFloorSchema);
    },
  };
}

test('it writes no floor while no erasure has finished', async () => {
  const ctx = await setupTest();

  await ctx.stage();
  await ctx.writeFloor();

  const names = await readdir(join(ctx.dataDir, 'backup'));

  expect(names).toStrictEqual(['000000000001']);
});

test('it floors every set that exists when an erasure finishes, and none that stages after it', async () => {
  const ctx = await setupTest();
  const before = await ctx.stage();

  invariant(before, 'a set stages');

  await ctx.seed.finishedErasure();
  await ctx.writeFloor();

  const afterFirstErasure = await ctx.stage();

  invariant(afterFirstErasure, 'a set stages');

  const floor = await ctx.readFloor();

  expect(floor).toStrictEqual({ value: { format: 1, sequence: before.sequence } });
  expect(afterFirstErasure.sequence).toBeGreaterThan(before.sequence);
});
