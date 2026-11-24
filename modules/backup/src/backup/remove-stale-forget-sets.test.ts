import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { localDataStorage } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { readTestBackupSets } from '../test-utils/read-test-backup-sets';
import { removeStaleForgetSets } from './remove-stale-forget-sets';
import { writeSnapshotSet } from './write-snapshot-set';

async function setupTest() {
  const log = await startTestLog();

  const context = { writer: log.writer, storage: localDataStorage };

  return {
    ...log,
    context,
    seed: buildSeeder({ log: log.log, context }),
    stage: () => writeSnapshotSet(context, 'scheduled'),
    readStagedNames: () => readdir(join(log.dataDir, 'backup')),
  };
}

test('it withdraws a staged set that started before a finished erasure', async () => {
  const ctx = await setupTest();
  const staged = await ctx.stage();

  invariant(staged, 'a set stages');

  await ctx.seed.finishedErasure();

  const withdrawn = await removeStaleForgetSets(ctx.context);

  expect(withdrawn).toStrictEqual([staged.sequence]);

  const sets = await readTestBackupSets(ctx.writer);
  const names = await ctx.readStagedNames();

  expect(sets).toStrictEqual([
    { sequence: staged.sequence, kind: 'scheduled', state: 'abandoned' },
  ]);

  expect(names).toStrictEqual([]);
});

test('it keeps a staged set that started after the finished erasure', async () => {
  const ctx = await setupTest();

  await ctx.seed.finishedErasure();

  const staged = await ctx.stage();

  invariant(staged, 'a set stages');

  const withdrawn = await removeStaleForgetSets(ctx.context);

  expect(withdrawn).toStrictEqual([]);

  const sets = await readTestBackupSets(ctx.writer);

  expect(sets).toStrictEqual([{ sequence: staged.sequence, kind: 'scheduled', state: 'staged' }]);
});

test('it keeps a staged set once a published set covers the finished erasure', async () => {
  const ctx = await setupTest();
  const staged = await ctx.stage();

  invariant(staged, 'a set stages');

  await ctx.seed.finishedErasure();
  await ctx.seed.publishedBackupSet();

  const withdrawn = await removeStaleForgetSets(ctx.context);
  const sets = await readTestBackupSets(ctx.writer);

  expect([withdrawn, sets.find((set) => set.sequence === staged.sequence)?.state]).toStrictEqual([
    [],
    'staged',
  ]);
});
