import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { createConversationTask } from '../conversation/create-conversation-task';
import { claimTask } from '../task/projection/claim-task';
import { writeInboxRecords } from '../task/projection/write-inbox-records';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { conversationTaskID } from '../utils/conversation-task-id';
import { readStepOwnerText } from './read-step-owner-text';

async function setupTest() {
  const tasks = await startTestTasks();

  await createConversationTask(tasks.context);

  return {
    context: tasks.context,
    writeOwnerMessage: (text: string) =>
      writeInboxRecords(tasks.context, [
        {
          kind: 'owner_message',
          definitions: tasks.context.definitions(),
          thread: conversationTaskID,
          erasable: { text },
        },
      ]),
    claim: () =>
      claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID: conversationTaskID }),
  };
}

test('#readStepOwnerText gives the text of the first of 2 unread messages, the one that woke the step', async () => {
  const ctx = await setupTest();

  await ctx.writeOwnerMessage('Book a ferry');
  await ctx.writeOwnerMessage('Find a cabin');

  const claim = await ctx.claim();

  invariant(claim);

  const text = await readStepOwnerText(ctx.context, conversationTaskID, claim.startSequence + 1);

  expect(text).toBe('Book a ferry');
});

test('#readStepOwnerText gives null when no step began before the record', async () => {
  const ctx = await setupTest();

  await ctx.writeOwnerMessage('Book a ferry');

  const claim = await ctx.claim();

  invariant(claim);

  const text = await readStepOwnerText(ctx.context, conversationTaskID, claim.startSequence);

  expect(text).toBeNull();
});
