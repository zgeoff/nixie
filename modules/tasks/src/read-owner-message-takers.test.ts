import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { createConversationTask } from './create-conversation-task';
import { readOwnerMessageTakers } from './read-owner-message-takers';
import { startTestTasks } from './test-utils/start-test-tasks';

test('it gives the conversation and each started task, and leaves out a task on its own schedule', async () => {
  const ctx = await startTestTasks();

  await createConversationTask(ctx.context);

  await writeRecords(ctx.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: {
        taskID: 'k3x9m2p7qa',
        isConversation: false,
        state: 'waiting',
        startedBy: 'conversation',
      },
      erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
    },
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { taskID: 'memory-writer', isConversation: false, state: 'waiting' },
    },
  ]);

  const takers = await readOwnerMessageTakers(ctx.context, [
    'conversation',
    'k3x9m2p7qa',
    'memory-writer',
    'z0z0z0z0z0',
  ]);

  expect([...takers].toSorted()).toStrictEqual(['conversation', 'k3x9m2p7qa']);
});
