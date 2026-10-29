import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { buildStepRunID } from './build-step-run-id';
import { buildTaskMessageTool } from './build-task-message-tool';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { createSystemTask } from './create-system-task';
import { createTestConversationClaim } from './test-utils/create-test-conversation-claim';
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

test('it tells the sender of a question to a task on its own schedule that a reply arrives as a new message', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createSystemTask(ctx.context, 'memory-writer');

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  const tool = buildTaskMessageTool(ctx.context, {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      {
        taskID: 'memory-writer',
        name: 'Memory writer',
        brief: 'Saves memory.',
        isWokenByMessages: false,
      },
    ],
    hopLimit: 20,
    ownerName: 'Robin',
  });

  const outcome = await tool.run(
    buildMockToolCall({
      tool: 'task.message',
      input: { to: 'memory-writer', kind: 'question', body: 'Did the gym note save?' },
    }),
    buildMockToolContext({ run: { thread: 'planner', stepRunID: buildStepRunID(claim) } }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      messageID: expect.toBeString(),
      woke: false,
      hop: 1,
      note: expect.stringMatching(
        /^Delivered to Memory writer as \w+\. .* You do not wait on them for an answer, and a reply, if any, arrives as a new message\. /u,
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

test("it routes the conversation's message to a started task, names the task in a note, and records the route", async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'Add tulips to the garden plan.');

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
  ]);

  const tool = buildTaskMessageTool(ctx.context, {
    directory: [
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 20,
    ownerName: 'Robin',
  });

  const outcome = await tool.run(
    buildMockToolCall({
      tool: 'task.message',
      input: { to: 'k3x9m2p7qa', kind: 'request', body: 'Robin wants tulips in bed two.' },
    }),
    buildMockToolContext({ run: { thread: 'conversation', stepRunID: buildStepRunID(claim) } }),
  );

  invariant(outcome.status === 'ok');

  const routes = await readRecords(ctx.context.log, { afterSequence: 0, kinds: ['task.routed'] });

  expect(outcome.result).toStrictEqual({
    messageID: expect.toBeString(),
    woke: true,
    hop: 1,
    note: 'In your reply, tell Robin in a few words that you passed this to Garden plan.',
  });

  expect(routes.map((entry) => entry.record)).toMatchObject([
    {
      thread: 'conversation',
      payload: {
        taskID: 'k3x9m2p7qa',
        via: 'message',
        messageID: outcome.result['messageID'],
        messages: [2],
      },
    },
  ]);
});

test('it records no route for a message between two other tasks', async () => {
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

  await tool.run(
    buildMockToolCall({
      tool: 'task.message',
      input: { to: 'conversation', kind: 'report', body: 'The week is planned.' },
    }),
    buildMockToolContext({ run: { thread: 'planner', stepRunID: buildStepRunID(claim) } }),
  );

  const routes = await readRecords(ctx.context.log, { afterSequence: 0, kinds: ['task.routed'] });

  expect(routes).toStrictEqual([]);
});
