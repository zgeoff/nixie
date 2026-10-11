import { expect, test } from 'bun:test';
import type { StepInput } from '@heynixie/tasks';
import { createConversationTask, writeInboxRecords } from '@heynixie/tasks';
import { runNextStep } from './run-next-step';
import { startTestTasks } from './start-test-tasks';

test('it runs one step of the task with work and commits its result', async () => {
  const tasks = await startTestTasks();
  const inputs: StepInput[] = [];

  await createConversationTask(tasks.context);
  await writeInboxRecords(tasks.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Hi.' },
    },
  ]);
  await runNextStep(tasks.context, (input) => {
    inputs.push(input);
    return Promise.resolve({ next: 'wait', records: [], acknowledged: [2] });
  });

  const task = await tasks.db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  expect(inputs).toMatchObject([{ taskID: 'conversation', stepKey: 'conversation:1' }]);
  expect(task).toMatchObject({ state: 'waiting', read_cursor: 2 });
});

test('it throws when no task has work', async () => {
  const tasks = await startTestTasks();

  expect(
    runNextStep(tasks.context, () => Promise.reject(new Error('no step runs'))),
  ).rejects.toThrow('no task had work to claim');
});
