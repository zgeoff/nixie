import { expect, test } from 'bun:test';
import { writeStepError } from '../write-step-error';
import { createTestConversationClaim } from './create-test-conversation-claim';
import { readTestTaskProgress } from './read-test-task-progress';
import { startTestTasks } from './start-test-tasks';

function setupTest() {
  return startTestTasks();
}

test("it reads a task's state, its errors in a row, its read cursor and its session boundary", async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'is the bakery open?');

  await writeStepError(ctx.context, claim, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const progress = await readTestTaskProgress(ctx.context, 'conversation');

  expect(progress).toStrictEqual({
    state: 'ready',
    stepErrors: 1,
    readCursor: 0,
    sessionBoundary: null,
  });
});
