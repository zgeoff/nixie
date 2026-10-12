import { expect, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { readRecords } from '@heynixie/log';
import { startTestMemory } from './start-test-memory';

test('it starts a store over a log that folds the memory projections, with no record', async () => {
  const ctx = await startTestMemory();

  const records = await readRecords(ctx.log, { afterSequence: 0 });

  expect(ctx.log.projections.map((projection) => projection.table)).toStrictEqual([
    'threads',
    'memory_items',
    'memory_versions',
  ]);
  expect(records).toStrictEqual([]);
});

test('it removes the data directory when the test finishes', async () => {
  const ctx = await startTestMemory();

  onTestFinished(() => {
    expect(stat(ctx.dataDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  expect(ctx.dataDir).toBeString();
});
