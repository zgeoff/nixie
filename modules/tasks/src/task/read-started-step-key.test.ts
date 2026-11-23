import { expect, test } from 'bun:test';
import { writeStepCommit } from '../step/write-step-commit';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { conversationTaskID } from '../utils/conversation-task-id';
import { readStartedStepKey } from './read-started-step-key';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    readStartedStepKey: (taskID: string) => readStartedStepKey(tasks.context, taskID),
  };
}

test('it reads the key of the step that runs', async () => {
  const ctx = await setupTest();
  const step = await seedConversationStep(ctx.context);
  const stepKey = await ctx.readStartedStepKey(conversationTaskID);

  expect(stepKey).toBe(step.claim.stepKey);
});

test('it reads null once the step commits', async () => {
  const ctx = await setupTest();
  const step = await seedConversationStep(ctx.context);

  await writeStepCommit(ctx.context, step.claim, {
    next: 'wait',
    records: [],
    acknowledged: [step.messageSequence],
  });

  const stepKey = await ctx.readStartedStepKey(conversationTaskID);

  expect(stepKey).toBeNull();
});

test('it reads null for a task that does not exist', async () => {
  const ctx = await setupTest();
  const stepKey = await ctx.readStartedStepKey('task-unknown');

  expect(stepKey).toBeNull();
});
