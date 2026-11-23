import { expect, test } from 'bun:test';
import { readTaskGate } from '../gate/read-task-gate';
import { seedConversationStep } from './seed-conversation-step';
import { seedLimitReached } from './seed-limit-reached';
import { seedTask } from './seed-task';
import { startTestTasks } from './start-test-tasks';

test('it holds a task for its limit', async () => {
  const ctx = await startTestTasks();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await seedLimitReached(ctx.context, { taskID, stepKey: `${taskID}:1` });

  const gate = await readTaskGate(ctx.writer.db, taskID);

  expect(gate).toStrictEqual({ open: false, reason: 'limit', since: expect.any(Number) });
});
