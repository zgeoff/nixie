import { expect, test } from 'bun:test';
import { claimTask } from '../claim-task';
import { createConversationTask } from '../create-conversation-task';
import { createSystemTask } from '../create-system-task';
import type { TasksTables } from '../types';
import { startTestTasks } from './start-test-tasks';
import { writeTestTaskMessage } from './write-test-task-message';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test("it sends the message as the sender's step that holds its lease now", async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const outcome = await writeTestTaskMessage(
    ctx.context,
    {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
      ],
      hopLimit: 20,
    },
    {
      from: 'planner',
      to: 'conversation',
      kind: 'chat',
      body: 'Hello.',
      replyTo: null,
      onBehalfOf: [],
      wake: true,
    },
  );

  const messages = await ctx.db
    .selectFrom('task_messages')
    .select(['message_id', 'from_task', 'to_task'])
    .execute();

  expect(outcome).toMatchObject({ status: 'sent', hop: 1, woke: true });

  expect(messages).toStrictEqual([
    { message_id: expect.toBeString(), from_task: 'planner', to_task: 'conversation' },
  ]);
});
