import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { buildTasksListTool } from './build-tasks-list-tool';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { createSystemTask } from './create-system-task';
import { seedConversationStep } from './test-utils/seed-conversation-step';
import { seedStartedTask } from './test-utils/seed-started-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeTestTaskMessage } from './test-utils/write-test-task-message';
import { writeStepCommit } from './write-step-commit';
import { writeTaskControl } from './write-task-control';

function setupTest() {
  return startTestTasks();
}

test('it lists the tasks other than the caller, with each last activity in UTC', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);

  const tool = buildTasksListTool(ctx.context, {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
  });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'tasks.list', input: {} }),
    buildMockToolContext({ run: { thread: 'conversation' } }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      tasks: [
        {
          id: 'planner',
          name: 'Planner',
          state: 'ready',
          model: null,
          brief: 'Plans the week.',
          lastActivityAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
        },
      ],
    },
  });
});

test('it lists a started task with the name and brief it started with', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  await writeRecords(ctx.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: {
        taskID: 'k3x9m2p7qa',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
      },
      erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
    },
  ]);

  const tool = buildTasksListTool(ctx.context, {
    directory: [
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
  });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'tasks.list', input: {} }),
    buildMockToolContext({ run: { thread: 'conversation' } }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      tasks: [
        {
          id: 'k3x9m2p7qa',
          name: 'Garden plan',
          state: 'ready',
          model: null,
          brief: 'Plan the beds.',
          lastActivityAt: expect.toBeString(),
        },
      ],
    },
  });
});

test('it lists only as many tasks as the limit asks for', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createSystemTask(ctx.context, 'critic');

  const tool = buildTasksListTool(ctx.context, {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'critic', name: 'Critic', brief: 'Checks plans.', isWokenByMessages: true },
    ],
  });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'tasks.list', input: { limit: 1 } }),
    buildMockToolContext({ run: { thread: 'conversation' } }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      tasks: [
        {
          id: 'critic',
          name: 'Critic',
          state: 'ready',
          model: null,
          brief: 'Checks plans.',
          lastActivityAt: expect.toBeString(),
        },
      ],
    },
  });
});

test('it lists each task with the model it runs on', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const secondLook = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Second look',
    brief: 'Find the weak points in the plan.',
    options: { model: 'second-look', profile: 'router-b' },
  });

  const seedList = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Seed list',
    brief: 'List the seeds to order for spring.',
  });

  const tool = buildTasksListTool(ctx.context, {
    directory: [
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
  });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'tasks.list', input: {} }),
    buildMockToolContext({ run: { thread: 'conversation' } }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      tasks: [
        {
          id: seedList,
          name: 'Seed list',
          state: 'ready',
          model: null,
          brief: 'List the seeds to order for spring.',
          lastActivityAt: expect.toBeString(),
        },
        {
          id: secondLook,
          name: 'Second look',
          state: 'ready',
          model: 'second-look',
          brief: 'Find the weak points in the plan.',
          lastActivityAt: expect.toBeString(),
        },
      ],
    },
  });
});

test.each([
  ['idle', 'progress', {}],
  ['finished', 'report', {}],
  ['waiting', 'question', { waitingOn: 'conversation' }],
] as const)(
  'it lists as %s a started task whose turn ended after it sent a %s',
  async (state, kind, wait) => {
    const ctx = await setupTest();
    const starter = await seedConversationStep(ctx.context);

    const messaging = {
      directory: [
        { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
      ],
      hopLimit: 20,
    };

    const taskID = await seedStartedTask(ctx.context, {
      starter: starter.claim,
      name: 'Seed list',
      brief: 'List the seeds to order for spring.',
    });

    const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

    invariant(claim);

    await writeTestTaskMessage(ctx.context, messaging, {
      from: taskID,
      to: 'conversation',
      kind,
      body: 'Order the early peas and the dwarf beans.',
      replyTo: null,
      onBehalfOf: [],
      wake: true,
    });

    await writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [] });

    const tool = buildTasksListTool(ctx.context, messaging);

    const outcome = await tool.run(
      buildMockToolCall({ tool: 'tasks.list', input: {} }),
      buildMockToolContext({ run: { thread: 'conversation' } }),
    );

    expect(outcome).toStrictEqual({
      status: 'ok',
      result: {
        tasks: [
          {
            id: taskID,
            name: 'Seed list',
            state,
            model: null,
            brief: 'List the seeds to order for spring.',
            lastActivityAt: expect.toBeString(),
            ...wait,
          },
        ],
      },
    });
  },
);

test.each([
  ['finished', 'progress', 'report'],
  ['idle', 'report', 'progress'],
] as const)(
  'it lists as %s a started task that sent a %s and then a %s in its turn',
  async (state, first, last) => {
    const ctx = await setupTest();
    const starter = await seedConversationStep(ctx.context);

    const messaging = {
      directory: [
        { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
      ],
      hopLimit: 20,
    };

    const taskID = await seedStartedTask(ctx.context, {
      starter: starter.claim,
      name: 'Seed list',
      brief: 'List the seeds to order for spring.',
    });

    const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

    invariant(claim);

    await writeTestTaskMessage(ctx.context, messaging, {
      from: taskID,
      to: 'conversation',
      kind: first,
      body: 'The early peas go in first.',
      replyTo: null,
      onBehalfOf: [],
      wake: false,
    });

    await writeTestTaskMessage(ctx.context, messaging, {
      from: taskID,
      to: 'conversation',
      kind: last,
      body: 'Order the dwarf beans as well.',
      replyTo: null,
      onBehalfOf: [],
      wake: false,
    });

    await writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [] });

    const tool = buildTasksListTool(ctx.context, messaging);

    const outcome = await tool.run(
      buildMockToolCall({ tool: 'tasks.list', input: {} }),
      buildMockToolContext({ run: { thread: 'conversation' } }),
    );

    expect(outcome).toStrictEqual({
      status: 'ok',
      result: {
        tasks: [
          {
            id: taskID,
            name: 'Seed list',
            state,
            model: null,
            brief: 'List the seeds to order for spring.',
            lastActivityAt: expect.toBeString(),
          },
        ],
      },
    });
  },
);

test('it lists a finished task under done within the limit, behind a newer idle task', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const messaging = {
    directory: [
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 20,
  };

  const finishedID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Seed list',
    brief: 'List the seeds to order for spring.',
  });

  const idleID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Bed sizes',
    brief: 'Measure the four raised beds.',
  });

  const finished = await claimTask(ctx.context, {
    holder: 'runner-a',
    leaseMs: 60_000,
    taskID: finishedID,
  });

  invariant(finished);

  await writeTestTaskMessage(ctx.context, messaging, {
    from: finishedID,
    to: 'conversation',
    kind: 'report',
    body: 'Order the early peas and the dwarf beans.',
    replyTo: null,
    onBehalfOf: [],
    wake: false,
  });

  await writeStepCommit(ctx.context, finished, { next: 'wait', records: [], acknowledged: [] });

  const idle = await claimTask(ctx.context, {
    holder: 'runner-a',
    leaseMs: 60_000,
    taskID: idleID,
  });

  invariant(idle);

  await writeStepCommit(ctx.context, idle, { next: 'wait', records: [], acknowledged: [] });

  const tool = buildTasksListTool(ctx.context, messaging);

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'tasks.list', input: { state: 'done', limit: 1 } }),
    buildMockToolContext({ run: { thread: 'conversation' } }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      tasks: [
        {
          id: finishedID,
          name: 'Seed list',
          state: 'finished',
          model: null,
          brief: 'List the seeds to order for spring.',
          lastActivityAt: expect.toBeString(),
        },
      ],
    },
  });
});

test.each([
  ['active', []],
  [
    'waiting',
    [
      { id: 'critic', name: 'Critic', state: 'stopped', brief: 'Checks plans.' },
      { id: 'planner', name: 'Planner', state: 'paused', brief: 'Plans the week.' },
    ],
  ],
  ['done', [{ id: 'sorter', name: 'Sorter', state: 'closed', brief: 'Sorts the mail.' }]],
  [
    'all',
    [
      { id: 'sorter', name: 'Sorter', state: 'closed', brief: 'Sorts the mail.' },
      { id: 'critic', name: 'Critic', state: 'stopped', brief: 'Checks plans.' },
      { id: 'planner', name: 'Planner', state: 'paused', brief: 'Plans the week.' },
    ],
  ],
] as const)(
  'it lists under %s only the paused, stopped and closed tasks that belong there',
  async (state, expected) => {
    const ctx = await setupTest();

    await createSystemTask(ctx.context, 'planner');
    await createSystemTask(ctx.context, 'critic');
    await createSystemTask(ctx.context, 'sorter');
    await writeTaskControl(ctx.context, { taskID: 'planner', control: 'pause' });
    await writeTaskControl(ctx.context, { taskID: 'critic', control: 'stop' });
    await writeTaskControl(ctx.context, { taskID: 'sorter', control: 'close' });

    const tool = buildTasksListTool(ctx.context, {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        { taskID: 'critic', name: 'Critic', brief: 'Checks plans.', isWokenByMessages: true },
        { taskID: 'sorter', name: 'Sorter', brief: 'Sorts the mail.', isWokenByMessages: true },
      ],
    });

    const outcome = await tool.run(
      buildMockToolCall({ tool: 'tasks.list', input: { state } }),
      buildMockToolContext({ run: { thread: 'conversation' } }),
    );

    expect(outcome).toStrictEqual({
      status: 'ok',
      result: {
        tasks: expected.map((task) => ({
          ...task,
          model: null,
          lastActivityAt: expect.toBeString(),
        })),
      },
    });
  },
);

test.each([
  [
    'waiting',
    [
      { id: 'planner', name: 'Planner', state: 'idle', brief: 'Plans the week.' },
      { id: 'conversation', name: 'Conversation', state: 'idle', brief: 'Talks.' },
    ],
  ],
  ['done', [{ id: 'critic', name: 'Critic', state: 'finished', brief: 'Checks plans.' }]],
] as const)(
  'it lists under %s the idle and finished tasks that belong there',
  async (state, expected) => {
    const ctx = await setupTest();

    const messaging = {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        { taskID: 'critic', name: 'Critic', brief: 'Checks plans.', isWokenByMessages: true },
        { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
      ],
      hopLimit: 20,
    };

    await createConversationTask(ctx.context);
    await createSystemTask(ctx.context, 'planner');
    await createSystemTask(ctx.context, 'critic');

    const planner = await claimTask(ctx.context, {
      holder: 'runner-a',
      leaseMs: 60_000,
      taskID: 'planner',
    });

    const critic = await claimTask(ctx.context, {
      holder: 'runner-a',
      leaseMs: 60_000,
      taskID: 'critic',
    });

    invariant(planner && critic);

    await writeTestTaskMessage(ctx.context, messaging, {
      from: 'critic',
      to: 'conversation',
      kind: 'report',
      body: 'The plan holds up.',
      replyTo: null,
      onBehalfOf: [],
      wake: false,
    });

    await writeStepCommit(ctx.context, planner, { next: 'wait', records: [], acknowledged: [] });
    await writeStepCommit(ctx.context, critic, { next: 'wait', records: [], acknowledged: [] });

    const tool = buildTasksListTool(ctx.context, messaging);

    const outcome = await tool.run(
      buildMockToolCall({ tool: 'tasks.list', input: { state } }),
      buildMockToolContext({ run: { thread: 'sorter' } }),
    );

    expect(outcome).toStrictEqual({
      status: 'ok',
      result: {
        tasks: expected.map((task) => ({
          ...task,
          model: null,
          lastActivityAt: expect.toBeString(),
        })),
      },
    });
  },
);
