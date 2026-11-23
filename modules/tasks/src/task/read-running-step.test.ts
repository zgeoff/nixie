import { expect, test } from 'bun:test';
import { writeStepCommit } from '../step/write-step-commit';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { conversationTaskID } from '../utils/conversation-task-id';
import { readRunningStep } from './read-running-step';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    readRunningStep: (taskID: string) => readRunningStep(tasks.context, taskID),
  };
}

test('it reads the key and the lease generation of the step that runs', async () => {
  const ctx = await setupTest();
  const step = await seedConversationStep(ctx.context);
  const running = await ctx.readRunningStep(conversationTaskID);

  expect(running).toStrictEqual({
    stepKey: step.claim.stepKey,
    generation: step.claim.lease.generation,
  });
});

test('it reads null once the step commits', async () => {
  const ctx = await setupTest();
  const step = await seedConversationStep(ctx.context);

  await writeStepCommit(ctx.context, step.claim, {
    next: 'wait',
    records: [],
    acknowledged: [step.messageSequence],
  });

  const running = await ctx.readRunningStep(conversationTaskID);

  expect(running).toBeNull();
});

test('it reads null once the lease of the step expires and no runner claims the step again', async () => {
  const ctx = await setupTest();

  await seedConversationStep(ctx.context);

  ctx.clock.advance(60_001);

  const running = await ctx.readRunningStep(conversationTaskID);

  expect(running).toBeNull();
});

test('it reads null for a task that does not exist', async () => {
  const ctx = await setupTest();
  const running = await ctx.readRunningStep('task-unknown');

  expect(running).toBeNull();
});
