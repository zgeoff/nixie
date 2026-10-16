import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { readConversationErrors } from './read-conversation-errors';
import { createTestClaim } from './test-utils/create-test-claim';
import { createTestConversationClaim } from './test-utils/create-test-conversation-claim';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeInboxRecords } from './write-inbox-records';
import { writeStepError } from './write-step-error';

function setupTest() {
  return startTestTasks();
}

test('it reads no errors before the conversation exists', async () => {
  const ctx = await setupTest();
  const errors = await readConversationErrors(ctx.writer.db);

  expect(errors).toBe(0);
});

test('it reads no errors for a conversation whose steps have not thrown', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const errors = await readConversationErrors(ctx.writer.db);

  expect(errors).toBe(0);
});

test("it reads the conversation's failed steps in a row", async () => {
  const ctx = await setupTest();
  const first = await createTestConversationClaim(ctx.context, 'Name a river.');

  await writeStepError(ctx.context, first, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      erasable: { text: 'Name a lake.' },
    },
  ]);

  const second = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(second);

  await writeStepError(ctx.context, second, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const errors = await readConversationErrors(ctx.writer.db);

  expect(errors).toBe(2);
});

test("it leaves out another task's failed steps", async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await createConversationTask(ctx.context);

  await writeStepError(ctx.context, claim, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const errors = await readConversationErrors(ctx.writer.db);

  expect(errors).toBe(0);
});
