import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { seedTurnEnded } from './seed-turn-ended';
import { startTestTasks } from './start-test-tasks';

test('it leaves a turn end record on the conversation thread', async () => {
  const tasks = await startTestTasks();
  const record = await seedTurnEnded(tasks.context);

  const entries = await readRecords(tasks.context.log, {
    afterSequence: 0,
    kinds: ['model.turn_ended'],
  });

  expect(entries.map((entry) => [entry.record.sequence, entry.record.thread])).toStrictEqual([
    [record.sequence, 'conversation'],
  ]);
});
