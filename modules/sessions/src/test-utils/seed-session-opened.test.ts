import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { seedSessionOpened } from './seed-session-opened';
import { startTestTasks } from './start-test-tasks';

test('it leaves a session opening record on the conversation thread', async () => {
  const tasks = await startTestTasks();
  const record = await seedSessionOpened(tasks.context);

  const entries = await readRecords(tasks.context.log, {
    afterSequence: 0,
    kinds: ['model.session_opened'],
  });

  expect(entries.map((entry) => [entry.record.sequence, entry.record.thread])).toStrictEqual([
    [record.sequence, 'conversation'],
  ]);
});
