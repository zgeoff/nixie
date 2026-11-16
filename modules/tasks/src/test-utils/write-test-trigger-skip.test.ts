import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { seedDefinitionTask } from './seed-definition-task';
import { startTestTasks } from './start-test-tasks';
import { writeTestTriggerSkip } from './write-test-trigger-skip';

test('#writeTestTriggerSkip writes a trigger.skipped record on the thread of the task', async () => {
  const ctx = await startTestTasks();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  const sequence = await writeTestTriggerSkip(ctx.context, taskID, {
    definitionID: 'water-the-tomatoes',
    reason: 'task_held',
  });

  const [entry] = await readRecords(ctx.context.log, { afterSequence: sequence - 1, limit: 1 });

  expect(entry?.record).toMatchObject({
    sequence,
    kind: 'trigger.skipped',
    thread: taskID,
    payload: { definitionID: 'water-the-tomatoes', reason: 'task_held' },
  });
});
