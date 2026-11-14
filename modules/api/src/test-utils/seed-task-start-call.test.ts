import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { seedTaskStartCall } from './seed-task-start-call';
import { startTestAPI } from './start-test-api';

function setupTest() {
  return startTestAPI();
}

test('it seeds a task.start call on the conversation, its result naming the task, and the brief record the start wrote', async () => {
  const ctx = await setupTest();

  const seeded = await seedTaskStartCall(ctx.context, {
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const entries = await readRecords(ctx.context.log, {
    afterSequence: 0,
    sequences: [seeded.callSequence, seeded.resultSequence, seeded.briefSequence],
  });

  expect(
    entries.map((entry) => [entry.record.kind, entry.record.thread, entry.record.erasable]),
  ).toStrictEqual([
    [
      'tool_called',
      'conversation',
      {
        status: 'readable',
        fields: { input: { name: 'Tide tables', brief: 'Find the high tides for Saturday.' } },
      },
    ],
    [
      'task_message',
      seeded.taskID,
      { status: 'readable', fields: { body: 'Find the high tides for Saturday.' } },
    ],
    [
      'tool_result',
      'conversation',
      {
        status: 'readable',
        fields: {
          result: {
            taskID: seeded.taskID,
            name: 'Tide tables',
            note: 'The task starts on its brief now.',
          },
        },
      },
    ],
  ]);
});
