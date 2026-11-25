import { expect, test } from 'bun:test';
import { withWriteTransaction, writeRecords } from '@heynixie/log';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import { recallPageLimitBytes } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createConversationTask } from '../conversation/create-conversation-task';
import { withdrawDefinitionTaskInTransaction } from '../definition/withdraw-definition-task-in-transaction';
import { readInbox } from '../inbox/read-inbox';
import { taskRunOptionsSchema } from '../limit/task-run-options-schema';
import { buildTaskRunnerRegistry } from '../runner/build-task-runner-registry';
import { conversationRunner } from '../runner/conversation-runner';
import { sandboxRunner } from '../runner/sandbox-runner';
import type { TaskRunnerDefinition } from '../runner/types';
import { buildStepRunID } from '../step/build-step-run-id';
import { writeStepCommit } from '../step/write-step-commit';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedDefinitionTask } from '../test-utils/seed-definition-task';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { writeTestTaskMessage } from '../test-utils/write-test-task-message';
import { writeTestTriggerFire } from '../test-utils/write-test-trigger-fire';
import type { StartedClaim, TaskClaim, TasksContext } from '../types';
import { buildTasksListTool } from './build-tasks-list-tool';
import { createSystemTask } from './create-system-task';
import { claimTask } from './projection/claim-task';
import { writeTaskStart } from './start/write-task-start';
import { startedTaskDefaultTools } from './started-task-default-tools';
import { writeTaskControl } from './write-task-control';

async function setupTest() {
  const tasks = await startTestTasks();

  const codingRunner: TaskRunnerDefinition = {
    ...sandboxRunner,
    key: 'coding',
    meters: [],
    listFields: (_context, taskIDs) =>
      Promise.resolve(new Map(taskIDs.map((taskID) => [taskID, { session: { state: 'open' } }]))),
  };

  const codingContext: TasksContext = {
    ...tasks.context,
    runners: buildTaskRunnerRegistry({
      definitions: [conversationRunner, sandboxRunner, codingRunner],
      defaultRunner: sandboxRunner,
    }),
  };

  return {
    ...tasks,
    codingContext,
    startCodingTask: async (starter: StartedClaim, name: string, brief: string) => {
      const outcome = await writeTaskStart(codingContext, {
        from: 'conversation',
        name,
        brief,
        runner: 'coding',
        stored: {
          kind: 'built',
          options: taskRunOptionsSchema.parse({
            model: null,
            profile: null,
            persona: 'none',
            memory: 'none',
            tools: startedTaskDefaultTools,
            report: 'wake',
            limits: { turns: 25, dollars: 2 },
          }),
        },
        hopLimit: 6,
        stepRunID: buildStepRunID(starter),
        disposable: false,
      });

      invariant(outcome.status === 'started', 'the coding start is valid');

      return outcome.taskID;
    },
    readUnreadSequences: async (claim: TaskClaim) => {
      const inbox = await readInbox(tasks.context, claim.lease.workID);

      return inbox.map((record) => record.sequence);
    },
  };
}

test('it lists the tasks other than the caller, with each last activity in UTC', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);

  const tool = buildTasksListTool(ctx.context, {
    directory: [
      {
        taskID: 'planner',
        name: 'Planner',
        brief: 'Plans the week.',
        wakeable: true,
        speaker: 'plain_task' as const,
      },
      {
        taskID: 'conversation',
        name: 'Conversation',
        brief: 'Talks.',
        wakeable: true,
        speaker: 'conversation' as const,
      },
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
          isBriefClipped: false,
          runner: '',
          lastActivityAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
          wakeable: true,
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
      {
        taskID: 'conversation',
        name: 'Conversation',
        brief: 'Talks.',
        wakeable: true,
        speaker: 'conversation' as const,
      },
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
          isBriefClipped: false,
          runner: 'sandbox',
          lastActivityAt: expect.toBeString(),
          wakeable: true,
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
      {
        taskID: 'planner',
        name: 'Planner',
        brief: 'Plans the week.',
        wakeable: true,
        speaker: 'plain_task' as const,
      },
      {
        taskID: 'critic',
        name: 'Critic',
        brief: 'Checks plans.',
        wakeable: true,
        speaker: 'plain_task' as const,
      },
    ],
  });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'tasks.list', input: { limit: 1 } }),
    buildMockToolContext({ run: { thread: 'conversation' } }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      nextCursor: expect.toBeString(),
      tasks: [
        {
          id: 'critic',
          name: 'Critic',
          state: 'ready',
          model: null,
          brief: 'Checks plans.',
          isBriefClipped: false,
          runner: '',
          lastActivityAt: expect.toBeString(),
          wakeable: true,
        },
      ],
    },
  });
});

test('it lists each task with the model it runs on', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const secondLook = await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Second look',
    brief: 'Find the weak points in the plan.',
    options: { model: 'second-look', profile: 'router-b' },
  });

  const seedsTask = await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Seed list',
    brief: 'List the seeds to order for spring.',
  });

  const tool = buildTasksListTool(ctx.context, {
    directory: [
      {
        taskID: 'conversation',
        name: 'Conversation',
        brief: 'Talks.',
        wakeable: true,
        speaker: 'conversation' as const,
      },
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
          id: seedsTask,
          name: 'Seed list',
          state: 'ready',
          model: null,
          brief: 'List the seeds to order for spring.',
          isBriefClipped: false,
          runner: 'sandbox',
          lastActivityAt: expect.toBeString(),
          wakeable: true,
        },
        {
          id: secondLook,
          name: 'Second look',
          state: 'ready',
          model: 'second-look',
          brief: 'Find the weak points in the plan.',
          isBriefClipped: false,
          runner: 'sandbox',
          lastActivityAt: expect.toBeString(),
          wakeable: true,
        },
      ],
    },
  });
});

test.each([
  ['idle', 'progress', {}, {}],
  [
    'finished',
    'report',
    { run: { activity: 'worked', report: { summary: 'Order the early peas.' } } },
    {},
  ],
  ['waiting', 'question', {}, { waitingOn: 'conversation' }],
] as const)(
  'it lists as %s a started task whose turn ended after it sent a %s',
  async (state, kind, run, wait) => {
    const ctx = await setupTest();
    const starter = await seedConversationStep(ctx.context);

    const messaging = {
      directory: [
        {
          taskID: 'conversation',
          name: 'Conversation',
          brief: 'Talks.',
          wakeable: true,
          speaker: 'conversation' as const,
        },
      ],
      hopLimit: 20,
    };

    const taskID = await seedTask(ctx.context, {
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

    await writeStepCommit(ctx.context, claim, {
      next: 'wait',
      records: [],
      acknowledged: await ctx.readUnreadSequences(claim),
      ...run,
    });

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
            isBriefClipped: false,
            runner: 'sandbox',
            lastActivityAt: expect.toBeString(),
            wakeable: true,
            ...wait,
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
      {
        taskID: 'conversation',
        name: 'Conversation',
        brief: 'Talks.',
        wakeable: true,
        speaker: 'conversation' as const,
      },
    ],
    hopLimit: 20,
  };

  const finishedID = await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Seed list',
    brief: 'List the seeds to order for spring.',
  });

  const idleID = await seedTask(ctx.context, {
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

  await writeStepCommit(ctx.context, finished, {
    next: 'wait',
    records: [],
    acknowledged: await ctx.readUnreadSequences(finished),
    run: { activity: 'worked', report: { summary: 'Order the early peas.' } },
  });

  const idle = await claimTask(ctx.context, {
    holder: 'runner-a',
    leaseMs: 60_000,
    taskID: idleID,
  });

  invariant(idle);

  await writeStepCommit(ctx.context, idle, {
    next: 'wait',
    records: [],
    acknowledged: await ctx.readUnreadSequences(idle),
  });

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
          isBriefClipped: false,
          runner: 'sandbox',
          lastActivityAt: expect.toBeString(),
          wakeable: true,
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
        {
          taskID: 'planner',
          name: 'Planner',
          brief: 'Plans the week.',
          wakeable: true,
          speaker: 'plain_task' as const,
        },
        {
          taskID: 'critic',
          name: 'Critic',
          brief: 'Checks plans.',
          wakeable: true,
          speaker: 'plain_task' as const,
        },
        {
          taskID: 'sorter',
          name: 'Sorter',
          brief: 'Sorts the mail.',
          wakeable: true,
          speaker: 'plain_task' as const,
        },
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
          isBriefClipped: false,
          runner: '',
          lastActivityAt: expect.toBeString(),
          wakeable: true,
        })),
      },
    });
  },
);

test.each([
  [
    'waiting',
    [
      { id: 'critic', name: 'Critic', state: 'idle', runner: '', brief: 'Checks plans.' },
      { id: 'planner', name: 'Planner', state: 'idle', runner: '', brief: 'Plans the week.' },
      {
        id: 'conversation',
        name: 'Conversation',
        state: 'idle',
        runner: 'conversation',
        brief: 'Talks.',
      },
    ],
  ],
  ['done', []],
] as const)('it lists under %s the idle tasks that belong there', async (state, expected) => {
  const ctx = await setupTest();

  const messaging = {
    directory: [
      {
        taskID: 'planner',
        name: 'Planner',
        brief: 'Plans the week.',
        wakeable: true,
        speaker: 'plain_task' as const,
      },
      {
        taskID: 'critic',
        name: 'Critic',
        brief: 'Checks plans.',
        wakeable: true,
        speaker: 'plain_task' as const,
      },
      {
        taskID: 'conversation',
        name: 'Conversation',
        brief: 'Talks.',
        wakeable: true,
        speaker: 'conversation' as const,
      },
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

  await writeStepCommit(ctx.context, planner, {
    next: 'wait',
    records: [],
    acknowledged: await ctx.readUnreadSequences(planner),
  });

  await writeStepCommit(ctx.context, critic, {
    next: 'wait',
    records: [],
    acknowledged: await ctx.readUnreadSequences(critic),
  });

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
        isBriefClipped: false,
        lastActivityAt: expect.toBeString(),
        wakeable: true,
      })),
    },
  });
});

test.each([
  {
    label: 'with a schedule shows its next run',
    nextFire: '2026-06-04T07:00:00.000Z',
    shown: { nextRunAt: '2026-06-04T07:00:00.000Z' },
  },
  { label: 'with no slot left shows no next run', nextFire: null, shown: {} },
] as const)('it lists an asleep definition task $label', async (row) => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { name: 'Water the tomatoes', brief: 'Water the beds.' },
  });

  ctx.definitionStore.setNextFire('water-the-tomatoes', row.nextFire);

  const tool = buildTasksListTool(ctx.context, { directory: [] });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'tasks.list', input: { state: 'waiting' } }),
    buildMockToolContext({ run: { thread: 'conversation' } }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      tasks: [
        {
          id: taskID,
          name: 'Water the tomatoes',
          state: 'asleep',
          model: null,
          brief: 'Water the beds.',
          isBriefClipped: false,
          runner: 'sandbox',
          lastActivityAt: expect.toBeString(),
          wakeable: false,
          ...row.shown,
        },
      ],
    },
  });
});

test('it lists a wakeable definition task as idle with no next run', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { name: 'Water the tomatoes', brief: 'Water the beds.', wakeable: true },
  });

  ctx.definitionStore.setNextFire('water-the-tomatoes', '2026-06-04T07:00:00.000Z');

  const tool = buildTasksListTool(ctx.context, { directory: [] });

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
          name: 'Water the tomatoes',
          state: 'idle',
          model: null,
          brief: 'Water the beds.',
          isBriefClipped: false,
          runner: 'sandbox',
          lastActivityAt: expect.toBeString(),
          wakeable: true,
        },
      ],
    },
  });
});

test('it lists a wakeable definition task as finished when its newest task run reported and sent no message', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { name: 'Water the tomatoes', brief: 'Water the beds.', wakeable: true },
    policy: { wakeable: true, report: 'none' },
  });

  await writeTestTriggerFire(ctx.context, taskID, { definitionHash: 'hash-1' });

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  invariant(claim, 'the fire made the task ready');

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: await ctx.readUnreadSequences(claim),
    run: { activity: 'worked', report: { summary: 'The beds are watered.' } },
  });

  const tool = buildTasksListTool(ctx.context, { directory: [] });

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
          name: 'Water the tomatoes',
          state: 'finished',
          model: null,
          brief: 'Water the beds.',
          isBriefClipped: false,
          runner: 'sandbox',
          lastActivityAt: expect.toBeString(),
          wakeable: true,
        },
      ],
    },
  });
});

test('it pages 200 tasks with long briefs under the byte budget, listing each once', async () => {
  const ctx = await setupTest();

  const firstLine =
    'Compare the tide tables for the harbour across the whole month, noting each spring tide, each neap tide, the heights at both ends of the day, and every day on which the two sources disagree by more than ten centimetres.';

  const brief = `${firstLine}\nSecond line of the brief.\nThird line of the brief.`;
  const clipped = `${firstLine.slice(0, 200)}…`;

  const directory = Array.from({ length: 200 }, (_, index) => ({
    taskID: `tide-check-${index}`,
    name: `Tide check ${index}`,
    brief,
    wakeable: true,
    speaker: 'plain_task' as const,
  }));

  for (const profile of directory) {
    await createSystemTask(ctx.context, profile.taskID);
  }

  const expectedIDs = directory.map((profile) => profile.taskID);
  const tool = buildTasksListTool(ctx.context, { directory });
  const listedIDs: string[] = [];
  const briefs: unknown[] = [];
  const sizes: number[] = [];
  const cursor: { next: string | undefined } = { next: undefined };
  let pages = 0;

  do {
    const outcome = await tool.run(
      buildMockToolCall({
        tool: 'tasks.list',
        input: cursor.next === undefined ? {} : { cursor: cursor.next },
      }),
      buildMockToolContext({ run: { thread: 'conversation' } }),
    );

    invariant(outcome.status === 'ok', 'the list answers');

    const text = JSON.stringify(outcome.result);

    sizes.push(Buffer.byteLength(text));

    const entrySchema = z.object({
      id: z.string(),
      brief: z.string(),
      isBriefClipped: z.boolean(),
    });

    const resultSchema = z.object({
      tasks: z.array(entrySchema),
      nextCursor: z.string().optional(),
    });

    const result = resultSchema.parse(outcome.result);

    for (const task of result.tasks) {
      listedIDs.push(task.id);
      briefs.push([task.brief, task.isBriefClipped]);
    }

    cursor.next = result.nextCursor;
    pages += 1;
  } while (cursor.next !== undefined);

  expect(pages).toBeGreaterThan(1);
  expect(sizes).toSatisfyAll((size: number) => size <= recallPageLimitBytes);
  expect([...listedIDs].toSorted()).toStrictEqual([...expectedIDs].toSorted());
  expect(briefs).toSatisfyAll((entry: [string, boolean]) => entry[0] === clipped && entry[1]);
});

test('it pages a task out of force with a task run open, and a started task, listing each once', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const startedID = await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide check',
    brief: 'Compare the tide tables.',
  });

  const withdrawnID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { name: 'Water the tomatoes', brief: 'Water the beds.' },
  });

  await writeTestTriggerFire(ctx.context, withdrawnID, { definitionHash: 'hash-1' });
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID: withdrawnID });

  await withWriteTransaction(ctx.writer, (tx) =>
    withdrawDefinitionTaskInTransaction(tx, ctx.context, 'water-the-tomatoes'),
  );

  const tool = buildTasksListTool(ctx.context, { directory: [] });
  const entrySchema = z.object({ id: z.string() });

  const resultSchema = z.object({
    tasks: z.array(entrySchema),
    nextCursor: z.string().optional(),
  });

  const listedIDs: string[] = [];
  const cursor: { next: string | undefined } = { next: undefined };

  do {
    const outcome = await tool.run(
      buildMockToolCall({
        tool: 'tasks.list',
        input: cursor.next === undefined ? { limit: 1 } : { limit: 1, cursor: cursor.next },
      }),
      buildMockToolContext({ run: { thread: 'conversation' } }),
    );

    invariant(outcome.status === 'ok', 'the list answers');

    const result = resultSchema.parse(outcome.result);

    listedIDs.push(...result.tasks.map((task) => task.id));

    cursor.next = result.nextCursor;
  } while (cursor.next !== undefined);

  const expectedIDs = [startedID, withdrawnID].toSorted();

  expect([...listedIDs].toSorted()).toStrictEqual(expectedIDs);
});

test('it lists one task with its whole brief when given its ID', async () => {
  const ctx = await setupTest();

  const brief =
    'Compare the tide tables for the harbour.\nNote each spring tide.\nNote each neap tide.';

  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide check',
    brief,
  });

  const tool = buildTasksListTool(ctx.context, { directory: [] });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'tasks.list', input: { taskID, state: 'done', limit: 1 } }),
    buildMockToolContext({ run: { thread: 'conversation' } }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      tasks: [
        {
          id: taskID,
          name: 'Tide check',
          state: 'ready',
          model: null,
          brief,
          isBriefClipped: false,
          runner: 'sandbox',
          lastActivityAt: expect.toBeString(),
          wakeable: true,
        },
      ],
    },
  });
});

test('it answers an unknown task ID with an error that points at the list', async () => {
  const ctx = await setupTest();

  const tool = buildTasksListTool(ctx.context, { directory: [] });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'tasks.list', input: { taskID: 'nosuchtask' } }),
    buildMockToolContext({ run: { thread: 'conversation' } }),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'no task you can list has the ID nosuchtask; call tasks.list with no taskID to see the IDs',
  });
});

test('it answers a cursor it did not give with an error that says to start again', async () => {
  const ctx = await setupTest();

  const tool = buildTasksListTool(ctx.context, { directory: [] });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'tasks.list', input: { cursor: 'not-a-cursor' } }),
    buildMockToolContext({ run: { thread: 'conversation' } }),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'that cursor is not one tasks.list gave; call tasks.list again with no cursor',
  });
});

test('it lists only the tasks of the runner that the runner filter names, with the fields that runner adds', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Seed list',
    brief: 'List the seeds to order for spring.',
  });

  const codingTask = await ctx.startCodingTask(
    starter.claim,
    'Garden planner',
    'Add a frost warning to the planner.',
  );

  const tool = buildTasksListTool(ctx.codingContext, { directory: [] });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'tasks.list', input: { runner: 'coding' } }),
    buildMockToolContext({ run: { thread: 'conversation' } }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      tasks: [
        {
          id: codingTask,
          name: 'Garden planner',
          state: 'ready',
          model: null,
          brief: 'Add a frost warning to the planner.',
          isBriefClipped: false,
          runner: 'coding',
          limits: null,
          session: { state: 'open' },
          lastActivityAt: expect.toBeString(),
          wakeable: true,
        },
      ],
    },
  });
});

test('it lists one task by its ID with the fields its runner adds', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await ctx.startCodingTask(
    starter.claim,
    'Garden planner',
    'Add a frost warning to the planner.',
  );

  const tool = buildTasksListTool(ctx.codingContext, { directory: [] });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'tasks.list', input: { taskID } }),
    buildMockToolContext({ run: { thread: 'conversation' } }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      tasks: [
        {
          id: taskID,
          name: 'Garden planner',
          state: 'ready',
          model: null,
          brief: 'Add a frost warning to the planner.',
          isBriefClipped: false,
          runner: 'coding',
          limits: null,
          session: { state: 'open' },
          lastActivityAt: expect.toBeString(),
          wakeable: true,
        },
      ],
    },
  });
});
