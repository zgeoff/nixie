import { expect, test } from 'bun:test';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { buildStepRunID } from './build-step-run-id';
import { buildTaskMessageTool } from './build-task-message-tool';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { createSystemTask } from './create-system-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it sends the message and answers with its ID, its hop and that it woke the task', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  const tool = buildTaskMessageTool(ctx.context, {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 20,
    ownerName: 'Robin',
  });

  const outcome = await tool.run(
    buildMockToolCall({
      tool: 'task.message',
      input: { to: 'conversation', kind: 'report', body: 'The week is planned.' },
    }),
    buildMockToolContext({ run: { thread: 'planner', stepRunID: buildStepRunID(claim) } }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { messageID: expect.toBeString(), woke: true, hop: 1 },
  });
});

test('it tells the sender, in a note, why a message past the hop limit did not wake the task', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  await ctx.db.updateTable('tasks').set({ step_hop: 2 }).where('task_id', '=', 'planner').execute();

  const tool = buildTaskMessageTool(ctx.context, {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 2,
    ownerName: 'Robin',
  });

  const outcome = await tool.run(
    buildMockToolCall({
      tool: 'task.message',
      input: { to: 'conversation', kind: 'chat', body: 'Still planning.' },
    }),
    buildMockToolContext({ run: { thread: 'planner', stepRunID: buildStepRunID(claim) } }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      messageID: expect.toBeString(),
      woke: false,
      hop: 3,
      note: expect.stringMatching(
        /^Delivered to Conversation as \w+\. It did not wake them, because this exchange reached 2 messages with no message from Robin, timer or outside event\./u,
      ),
    },
  });
});

test("it refuses on-behalf-of IDs that are not the owner's messages, naming them", async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  const tool = buildTaskMessageTool(ctx.context, {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 20,
    ownerName: 'Robin',
  });

  const outcome = await tool.run(
    buildMockToolCall({
      tool: 'task.message',
      input: {
        to: 'conversation',
        kind: 'request',
        body: 'Book the table.',
        onBehalfOf: ['#1'],
      },
    }),
    buildMockToolContext({ run: { thread: 'planner', stepRunID: buildStepRunID(claim) } }),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: "onBehalfOf takes only the event IDs of Robin's own messages, and #1 is not",
  });
});

test('it refuses a message to a task the caller cannot message, pointing at tasks.list', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  const tool = buildTaskMessageTool(ctx.context, {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
    ],
    hopLimit: 20,
    ownerName: 'Robin',
  });

  const outcome = await tool.run(
    buildMockToolCall({
      tool: 'task.message',
      input: { to: 'gardener', kind: 'chat', body: 'Hello.' },
    }),
    buildMockToolContext({ run: { thread: 'planner', stepRunID: buildStepRunID(claim) } }),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'no task you can message has the ID gardener; tasks.list gives the IDs',
  });
});

test('it refuses a call that comes from no step, and sends nothing', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const tool = buildTaskMessageTool(ctx.context, {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 20,
    ownerName: 'Robin',
  });

  const outcome = await tool.run(
    buildMockToolCall({
      tool: 'task.message',
      input: { to: 'conversation', kind: 'chat', body: 'Hello.' },
    }),
    buildMockToolContext({ run: { thread: 'planner' } }),
  );

  const messages = await ctx.db
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'task_message')
    .execute();

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'this call comes from a step that no longer holds its task, so nixie sent nothing',
  });

  expect(messages).toStrictEqual([]);
});
