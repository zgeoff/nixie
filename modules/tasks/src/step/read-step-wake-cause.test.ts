import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { createConversationTask } from '../conversation/create-conversation-task';
import { claimTask } from '../task/projection/claim-task';
import { writeInboxRecords } from '../task/projection/write-inbox-records';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { conversationTaskID } from '../utils/conversation-task-id';
import { readStepWakeCause } from './read-step-wake-cause';

async function setupTest() {
  const tasks = await startTestTasks();

  await createConversationTask(tasks.context);

  return {
    context: tasks.context,
    writeOwnerMessage: () =>
      writeInboxRecords(tasks.context, [
        {
          kind: 'owner_message',
          definitions: tasks.context.definitions(),
          thread: conversationTaskID,
          erasable: { text: 'Please look into this.' },
        },
      ]),
    claim: () =>
      claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID: conversationTaskID }),
  };
}

test('#readStepWakeCause gives the cause of the step that began before the record', async () => {
  const ctx = await setupTest();

  await ctx.writeOwnerMessage();

  const claim = await ctx.claim();

  invariant(claim);

  const cause = await readStepWakeCause(ctx.context, conversationTaskID, claim.startSequence + 1);

  expect(cause).toStrictEqual({ kind: 'owner' });
});

test('#readStepWakeCause gives null when no step began before the record', async () => {
  const ctx = await setupTest();

  await ctx.writeOwnerMessage();

  const claim = await ctx.claim();

  invariant(claim);

  const cause = await readStepWakeCause(ctx.context, conversationTaskID, claim.startSequence);

  expect(cause).toBeNull();
});
