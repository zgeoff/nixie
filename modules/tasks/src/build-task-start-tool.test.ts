import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildStepRunID } from './build-step-run-id';
import { buildTaskStartTool } from './build-task-start-tool';
import { createTestConversationClaim } from './test-utils/create-test-conversation-claim';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it starts a task with its name and brief, routes the unread message to it, and tells the model to name it', async () => {
  const ctx = await setupTest();

  const claim = await createTestConversationClaim(
    ctx.context,
    'Plan the vegetable beds for spring.',
  );

  const tool = buildTaskStartTool(ctx.context, { ownerName: 'Robin' });

  const outcome = await tool.run(
    buildMockToolCall({
      tool: 'task.start',
      input: { name: 'Garden plan', brief: 'Plan four raised beds for a spring sowing.' },
    }),
    buildMockToolContext({ run: { thread: 'conversation', stepRunID: buildStepRunID(claim) } }),
  );

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['task_id', 'state', 'started_by'])
    .where('is_conversation', '=', 0)
    .executeTakeFirstOrThrow();

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['task.created', 'task.routed'],
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      taskID: task.task_id,
      name: 'Garden plan',
      note: 'In your reply, tell Robin in a few words that you passed this to the Garden plan task. No runner runs a started task in this release, so the task holds its messages unread: tell Robin it is queued.',
    },
  });

  expect(task).toStrictEqual({
    task_id: expect.toBeString(),
    state: 'ready',
    started_by: 'conversation',
  });

  expect(records.map((entry) => entry.record).slice(1)).toMatchObject([
    {
      kind: 'task.created',
      thread: task.task_id,
      payload: {
        taskID: task.task_id,
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
      },
      erasable: {
        status: 'readable',
        fields: { name: 'Garden plan', brief: 'Plan four raised beds for a spring sowing.' },
      },
    },
    {
      kind: 'task.routed',
      thread: 'conversation',
      payload: { taskID: task.task_id, via: 'start', messageID: null, messages: [2] },
    },
  ]);
});

test('it gives the started task a short ID', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'Track the parcel to Lyon.');

  const tool = buildTaskStartTool(ctx.context, { ownerName: null });

  const outcome = await tool.run(
    buildMockToolCall({
      tool: 'task.start',
      input: { name: 'Parcel', brief: 'Track the parcel until it lands.' },
    }),
    buildMockToolContext({ run: { thread: 'conversation', stepRunID: buildStepRunID(claim) } }),
  );

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { taskID: expect.stringMatching(/^[a-z0-9]{10}$/u) },
  });
});

test('it starts nothing for a call from a step that lost its task', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'Track the parcel to Lyon.');

  const tool = buildTaskStartTool(ctx.context, { ownerName: null });

  await ctx.db
    .updateTable('leases')
    .set({ generation: claim.lease.generation + 1 })
    .execute();

  const outcome = await tool.run(
    buildMockToolCall({
      tool: 'task.start',
      input: { name: 'Parcel', brief: 'Track the parcel until it lands.' },
    }),
    buildMockToolContext({ run: { thread: 'conversation', stepRunID: buildStepRunID(claim) } }),
  );

  const started = await ctx.db
    .selectFrom('tasks')
    .select('task_id')
    .where('is_conversation', '=', 0)
    .execute();

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'this call comes from a step that no longer holds its task, so nixie started nothing',
  });

  expect(started).toStrictEqual([]);
});

test('it refuses a task with a blank name', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'Track the parcel to Lyon.');

  const tool = buildTaskStartTool(ctx.context, { ownerName: null });

  const outcome = await tool.run(
    buildMockToolCall({
      tool: 'task.start',
      input: { name: '  ', brief: 'Track the parcel until it lands.' },
    }),
    buildMockToolContext({ run: { thread: 'conversation', stepRunID: buildStepRunID(claim) } }),
  );

  expect(outcome).toStrictEqual({ status: 'error', message: 'a task needs a name' });
});

test('it refuses a task with a blank brief', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'Track the parcel to Lyon.');

  const tool = buildTaskStartTool(ctx.context, { ownerName: null });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'task.start', input: { name: 'Parcel', brief: '' } }),
    buildMockToolContext({ run: { thread: 'conversation', stepRunID: buildStepRunID(claim) } }),
  );

  expect(outcome).toStrictEqual({ status: 'error', message: 'a task needs a brief' });
});
