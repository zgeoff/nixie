import { expect, test } from 'bun:test';
import type { StepInput } from '@heynixie/tasks';
import { createConversationTask, writeInboxRecords } from '@heynixie/tasks';
import { runNextStep } from './run-next-step';
import { startTestTasks } from './start-test-tasks';

function setupTest() {
  return startTestTasks();
}

test('it runs one step of the task with work and commits its result', async () => {
  const ctx = await setupTest();

  const inputs: StepInput[] = [];

  await createConversationTask(ctx.context);

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Hi.' },
    },
  ]);

  await runNextStep(ctx.context, (input) => {
    inputs.push(input);

    return Promise.resolve({ next: 'wait', records: [], acknowledged: [2] });
  });

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'read_cursor'])
    .executeTakeFirstOrThrow();

  expect(inputs).toMatchObject([{ taskID: 'conversation', stepKey: 'conversation:1' }]);
  expect(task).toStrictEqual({ state: 'waiting', read_cursor: 2 });
});

test('it throws when no task has work', async () => {
  const ctx = await setupTest();

  expect(runNextStep(ctx.context, () => Promise.reject(new Error('no step runs')))).rejects.toThrow(
    'no task had work to claim',
  );
});
