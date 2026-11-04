import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { buildStepRunID } from './build-step-run-id';
import { buildTaskStartTool } from './build-task-start-tool';
import { readTaskSetup } from './read-task-setup';
import { buildMockTaskStartBounds } from './test-utils/build-mock-task-start-bounds';
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

  const tool = buildTaskStartTool(ctx.context, { ownerName: 'Robin' }, buildMockTaskStartBounds());

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
      note: 'In your reply, tell Robin in a few words that you passed this to the Garden plan task. The task starts on its brief now, and its report comes back to you as a task message.',
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

  const tool = buildTaskStartTool(ctx.context, { ownerName: null }, buildMockTaskStartBounds());

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

test('it gives a repeated start of the same name in one step the task the first start made', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'Track the parcel to Lyon.');

  const tool = buildTaskStartTool(ctx.context, { ownerName: null }, buildMockTaskStartBounds());

  const call = buildMockToolCall({
    tool: 'task.start',
    input: { name: 'Parcel', brief: 'Track the parcel until it lands.' },
  });

  const run = buildMockToolContext({
    run: { thread: 'conversation', stepRunID: buildStepRunID(claim) },
  });

  const first = await tool.run(call, run);
  const again = await tool.run(call, run);

  const started = await ctx.db
    .selectFrom('tasks')
    .select('task_id')
    .where('is_conversation', '=', 0)
    .execute();

  expect(again).toStrictEqual(first);
  expect(started).toHaveLength(1);
});

test('it gives two overlapping starts of the same name in one step one task', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'Track the parcel to Lyon.');

  const tool = buildTaskStartTool(ctx.context, { ownerName: null }, buildMockTaskStartBounds());

  const call = buildMockToolCall({
    tool: 'task.start',
    input: { name: 'Parcel', brief: 'Track the parcel until it lands.' },
  });

  const run = buildMockToolContext({
    run: { thread: 'conversation', stepRunID: buildStepRunID(claim) },
  });

  const outcomes = await Promise.all([tool.run(call, run), tool.run(call, run)]);

  const started = await ctx.db
    .selectFrom('tasks')
    .select('task_id')
    .where('is_conversation', '=', 0)
    .execute();

  expect(outcomes[1]).toStrictEqual(outcomes[0]);
  expect(started).toHaveLength(1);
});

test('it starts a second task for another name in the same step', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'Track the parcel to Lyon.');

  const tool = buildTaskStartTool(ctx.context, { ownerName: null }, buildMockTaskStartBounds());

  const run = buildMockToolContext({
    run: { thread: 'conversation', stepRunID: buildStepRunID(claim) },
  });

  await tool.run(
    buildMockToolCall({
      tool: 'task.start',
      input: { name: 'Parcel', brief: 'Track the parcel until it lands.' },
    }),
    run,
  );

  await tool.run(
    buildMockToolCall({
      tool: 'task.start',
      input: { name: 'Ferry', brief: 'Book the Saturday ferry.' },
    }),
    run,
  );

  const started = await ctx.db
    .selectFrom('tasks')
    .select('task_id')
    .where('is_conversation', '=', 0)
    .execute();

  expect(started).toHaveLength(2);
});

test('it starts nothing for a call from a step that lost its task', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'Track the parcel to Lyon.');

  const tool = buildTaskStartTool(ctx.context, { ownerName: null }, buildMockTaskStartBounds());

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

  const tool = buildTaskStartTool(ctx.context, { ownerName: null }, buildMockTaskStartBounds());

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

  const tool = buildTaskStartTool(ctx.context, { ownerName: null }, buildMockTaskStartBounds());

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'task.start', input: { name: 'Parcel', brief: '' } }),
    buildMockToolContext({ run: { thread: 'conversation', stepRunID: buildStepRunID(claim) } }),
  );

  expect(outcome).toStrictEqual({ status: 'error', message: 'a task needs a brief' });
});

test('it shows the model each selectable model as an enum value, with its description', async () => {
  const ctx = await setupTest();

  const tool = buildTaskStartTool(
    ctx.context,
    { ownerName: null },
    buildMockTaskStartBounds({
      models: [
        { name: 'second-look', profile: 'router-b', description: 'Another family' },
        { name: 'quick', profile: 'small-fast', description: 'Fast and cheap' },
      ],
    }),
  );

  expect(tool.input['properties']).toMatchObject({
    model: {
      type: 'string',
      enum: ['second-look', 'quick'],
      description:
        'The model the task runs on; leave it out for the usual one. second-look: Another family; quick: Fast and cheap',
    },
  });
});

test('it shows the model no model choice when no model is selectable', async () => {
  const ctx = await setupTest();

  const tool = buildTaskStartTool(ctx.context, { ownerName: null }, buildMockTaskStartBounds());

  expect(tool.input['properties']).not.toContainKey('model');
});

test('it starts a stranger on a selectable model with the tools it asks for, and keeps the options', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'Check the plan with fresh eyes.');

  const tool = buildTaskStartTool(
    ctx.context,
    { ownerName: null },
    buildMockTaskStartBounds({
      models: [{ name: 'second-look', profile: 'router-b', description: 'Another family' }],
    }),
  );

  const outcome = await tool.run(
    buildMockToolCall({
      tool: 'task.start',
      input: {
        name: 'Second look',
        brief: 'Find the weak points in the four-bed garden plan.',
        model: 'second-look',
        persona: 'none',
        memory: 'none',
        tools: ['web_fetch'],
        limits: { turns: 6, dollars: 0.5 },
      },
    }),
    buildMockToolContext({
      run: {
        thread: 'conversation',
        stepRunID: buildStepRunID(claim),
        tools: ['tasks.list', 'task.message', 'task.start', 'web_fetch', 'memory.recall'],
      },
    }),
  );

  invariant(outcome.status === 'ok');

  const taskID = outcome.result['taskID'];

  invariant(typeof taskID === 'string');

  const setup = await readTaskSetup(ctx.context, taskID);

  expect(setup).toStrictEqual({
    startedBy: 'conversation',
    options: {
      model: 'second-look',
      profile: 'router-b',
      persona: 'none',
      memory: 'none',
      tools: ['tasks.list', 'task.message', 'web_fetch'],
      report: 'wake',
      limits: { turns: 6, dollars: 0.5 },
    },
    limits: { turns: 6, dollars: 0.5 },
  });
});

test.each([
  [
    'a model that is not selectable',
    { model: 'opus-high' },
    'opus-high is not a model a task can run on, so nixie started nothing',
  ],
  [
    'a tool list wider than its starter holds',
    { tools: ['web_fetch', 'log.read'] },
    'a task gets only tools you hold, and you do not hold log.read, so nixie started nothing',
  ],
  [
    'a turn limit above the max',
    { limits: { turns: 101 } },
    "a task's turns limit is at most 100, so nixie started nothing",
  ],
  [
    'a stranger that reads memory',
    { persona: 'none', memory: 'read' },
    'a task with persona none cannot read memory, so nixie started nothing',
  ],
  [
    'a tool that only the conversation can use',
    { tools: ['skill_read'] },
    'only the conversation can use skill_read, so nixie started nothing',
  ],
])('it starts nothing for %s', async (_case, options, message) => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'Check the plan with fresh eyes.');

  const tool = buildTaskStartTool(
    ctx.context,
    { ownerName: null },
    buildMockTaskStartBounds({
      models: [{ name: 'second-look', profile: 'router-b', description: 'Another family' }],
    }),
  );

  const outcome = await tool.run(
    buildMockToolCall({
      tool: 'task.start',
      input: { name: 'Second look', brief: 'Find the weak points in the plan.', ...options },
    }),
    buildMockToolContext({
      run: {
        thread: 'conversation',
        stepRunID: buildStepRunID(claim),
        tools: ['tasks.list', 'task.message', 'task.start', 'web_fetch', 'skill_read'],
      },
    }),
  );

  const started = await ctx.db
    .selectFrom('tasks')
    .select('task_id')
    .where('is_conversation', '=', 0)
    .execute();

  expect(outcome).toStrictEqual({ status: 'error', message });
  expect(started).toStrictEqual([]);
});

test('it tells the model that a task started with no report sends none', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'Tidy the seed list.');

  const tool = buildTaskStartTool(ctx.context, { ownerName: 'Robin' }, buildMockTaskStartBounds());

  const outcome = await tool.run(
    buildMockToolCall({
      tool: 'task.start',
      input: { name: 'Seed list', brief: 'Sort the seed list by sowing month.', report: 'none' },
    }),
    buildMockToolContext({ run: { thread: 'conversation', stepRunID: buildStepRunID(claim) } }),
  );

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      note: 'In your reply, tell Robin in a few words that you passed this to the Seed list task. The task starts on its brief now, and it sends you no report.',
    },
  });
});
