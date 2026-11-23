import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { seedSessionInvalidated } from './seed-session-invalidated';
import { startTestTasks } from './start-test-tasks';

test('it leaves an invalidation record on the conversation thread', async () => {
  const tasks = await startTestTasks();
  const record = await seedSessionInvalidated(tasks.context);

  const entries = await readRecords(tasks.context.log, {
    afterSequence: 0,
    kinds: ['model.session_invalidated'],
  });

  expect(entries.map((entry) => [entry.record.sequence, entry.record.thread])).toStrictEqual([
    [record.sequence, 'conversation'],
  ]);
});
