import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { createConversationTask } from '../conversation/create-conversation-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { conversationTaskID } from '../utils/conversation-task-id';
import { readStepOrigin } from './read-step-origin';

async function setupTest() {
  const tasks = await startTestTasks();

  await createConversationTask(tasks.context);

  const definitions = tasks.context.definitions();

  const stepKeys = new Map<string, string>();

  return {
    context: tasks.context,
    reads: {
      readActionStepKey: (actionID: string) => Promise.resolve(stepKeys.get(actionID) ?? null),
    },
    queueAction: (stepKey: string, actionID: string) => stepKeys.set(actionID, stepKey),
    writeOwnerMessage: async (text: string) => {
      const [record] = await writeRecords(tasks.context.log, [
        { kind: 'owner_message', definitions, thread: conversationTaskID, erasable: { text } },
      ]);

      return record?.sequence ?? 0;
    },
    writeStepStarted: async (
      stepKey: string,
      cause: { kind: 'owner' } | { kind: 'event' },
      source: number,
    ) => {
      const [record] = await writeRecords(tasks.context.log, [
        {
          kind: 'task.step_started',
          definitions,
          thread: conversationTaskID,
          stepKey,
          payload: { taskID: conversationTaskID, stepKey, generation: 1, cause, source },
        },
      ]);

      return record?.sequence ?? 0;
    },
    writeApprovalWake: async (actionID: string) => {
      const [record] = await writeRecords(tasks.context.log, [
        {
          kind: 'task.wake',
          definitions,
          thread: conversationTaskID,
          payload: { at: 1, actionID },
        },
      ]);

      return record?.sequence ?? 0;
    },
  };
}

test('#readStepOrigin gives the owner and the text of a step that the owner woke', async () => {
  const ctx = await setupTest();
  const message = await ctx.writeOwnerMessage('Book a ferry');
  const started = await ctx.writeStepStarted('conversation:1', { kind: 'owner' }, message);
  const origin = await readStepOrigin(ctx.context, ctx.reads, conversationTaskID, started + 1);

  expect(origin).toStrictEqual({ cause: { kind: 'owner' }, ownerText: 'Book a ferry' });
});

test('#readStepOrigin gives the owner message behind a step that an approved call woke', async () => {
  const ctx = await setupTest();
  const message = await ctx.writeOwnerMessage('Book a ferry');
  const first = await ctx.writeStepStarted('conversation:1', { kind: 'owner' }, message);

  ctx.queueAction('conversation:1', 'action-1');

  const wake = await ctx.writeApprovalWake('action-1');
  const second = await ctx.writeStepStarted('conversation:2', { kind: 'event' }, wake);
  const origin = await readStepOrigin(ctx.context, ctx.reads, conversationTaskID, second + 1);

  expect(first).toBeLessThan(second);
  expect(origin).toStrictEqual({ cause: { kind: 'owner' }, ownerText: 'Book a ferry' });
});

test('#readStepOrigin gives the event of a step that nothing approved woke', async () => {
  const ctx = await setupTest();
  const wake = await ctx.writeApprovalWake('action-9');
  const started = await ctx.writeStepStarted('conversation:1', { kind: 'event' }, wake);
  const origin = await readStepOrigin(ctx.context, ctx.reads, conversationTaskID, started + 1);

  expect(origin).toStrictEqual({ cause: { kind: 'event' }, ownerText: null });
});
