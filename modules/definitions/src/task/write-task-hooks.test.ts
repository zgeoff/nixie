import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { startTestDefinitions } from '../test-utils/start-test-definitions';
import { writeTaskHooks } from './write-task-hooks';

test('it binds and arms nothing for a definition whose version is gone', async () => {
  const ctx = await startTestDefinitions();

  await withWriteTransaction(ctx.writer, (tx) =>
    writeTaskHooks(
      tx,
      { log: ctx.log, definitions: () => ({ snapshotHash: 'snap', personaVersion: 'p' }) },
      [{ id: 'water-the-tomatoes', hash: 'f'.repeat(64), origin: 'definitions' }],
    ),
  );

  const written = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['task.created', 'trigger.armed'],
  });

  expect(written).toStrictEqual([]);
});
