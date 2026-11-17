import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { readInbox } from '../inbox/read-inbox';
import { buildTaskStartTool } from '../lease/build-task-start-tool';
import { buildStepRunID } from '../step/build-step-run-id';
import { buildMockTaskStartBounds } from '../test-utils/build-mock-task-start-bounds';
import { buildStartedDirectory } from '../test-utils/build-started-directory';
import { buildTaskSeeder } from '../test-utils/build-task-seeder';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { writeTestTaskMessage } from '../test-utils/write-test-task-message';
import type { StartedClaim, TasksTables } from '../types';
import { buildTaskCloseTool } from './build-task-close-tool';
import { buildTasksListTool } from './build-tasks-list-tool';
import { createTask } from './create-task';
import { claimTask } from './projection/claim-task';
import { writeTaskControl } from './write-task-control';

async function setupTest() {
  const tasks = await startTestTasks();
  const starter = await seedConversationStep(tasks.context);

  const seed = buildTaskSeeder(tasks);
  const db = tasks.writer.db.$extendTables<TasksTables>();

  const buildSeedInput = (name: string) => ({
    starter: starter.claim,
    name,
    brief: 'Find the high tides for Saturday.',
  });

  const tool = buildTaskCloseTool(tasks.context, buildStartedDirectory('placeholder'));

  const close = (taskID: string, by: { thread: string; claim: StartedClaim } | null = null) =>
    tool.run(
      buildMockToolCall({ tool: 'task.close', input: { taskID } }),
      buildMockToolContext({
        run: {
          thread: by?.thread ?? 'conversation',
          stepRunID: buildStepRunID(by?.claim ?? starter.claim),
        },
      }),
    );

  return {
    ...tasks,
    seed,
    buildSeedInput,
    close,
    starter,
    readState: async (taskID: string) => {
      const task = await db
        .selectFrom('tasks')
        .select('state')
        .where('task_id', '=', taskID)
        .executeTakeFirstOrThrow();

      return task.state;
    },
    readRunEnds: async () => {
      const entries = await readRecords(tasks.context.log, {
        afterSequence: 0,
        kinds: ['task.run_ended'],
      });

      return entries.map((entry) => entry.record.payload);
    },
    readReportMessages: async () => {
      const entries = await readRecords(tasks.context.log, {
        afterSequence: 0,
        thread: 'conversation',
        kinds: ['task_message'],
      });

      return entries.filter((entry) => entry.record.payload['kind'] === 'report');
    },
    readClosed: async () => {
      const entries = await readRecords(tasks.context.log, {
        afterSequence: 0,
        kinds: ['task.closed'],
      });

      return entries.map((entry) => entry.record.payload);
    },
  };
}

type TestContext = Awaited<ReturnType<typeof setupTest>>;

test.each<[string, string, (ctx: TestContext) => Promise<string>]>([
  ['waiting', 'Tides', (ctx) => ctx.seed.waitingTask(ctx.buildSeedInput('Tides'))],
  [
    'paused',
    'Tide tables',
    (ctx) => ctx.seed.pausedTask({ starter: ctx.starter.claim, limits: { turns: 1, dollars: 1 } }),
  ],
  ['stopped', 'Tides', (ctx) => ctx.seed.stoppedTask(ctx.buildSeedInput('Tides'))],
  ['failed', 'Tides', (ctx) => ctx.seed.failedTask(ctx.buildSeedInput('Tides'))],
  ['done', 'Tides', (ctx) => ctx.seed.doneTask(ctx.buildSeedInput('Tides'))],
])(
  'it closes a %s started task, and records that nixie closed it',
  async (_state, name, seedInState) => {
    const ctx = await setupTest();
    const taskID = await seedInState(ctx);
    const outcome = await ctx.close(taskID);

    expect(outcome).toStrictEqual({
      status: 'ok',
      result: { taskID, name, state: 'closed', wasClosed: false },
    });

    const currentState = await ctx.readState(taskID);

    expect(currentState).toBe('closed');

    const currentClosed = await ctx.readClosed();

    expect(currentClosed).toStrictEqual([
      { taskID, stepKey: null, timerIDs: [], closedBy: 'nixie' },
    ]);
  },
);

test('it answers a task that is already closed with wasClosed and writes nothing', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.closedTask(ctx.buildSeedInput('Tides'));
  const before = await ctx.readClosed();
  const outcome = await ctx.close(taskID);
  const after = await ctx.readClosed();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { taskID, name: 'Tides', state: 'closed', wasClosed: true },
  });

  expect(after).toStrictEqual(before);
});

test('it refuses a task that is ready, because it is still working', async () => {
  const ctx = await setupTest();
  const taskID = await seedTask(ctx.context, ctx.buildSeedInput('Tides'));
  const outcome = await ctx.close(taskID);

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `${taskID} is still working, so nixie closed nothing; close it once it has finished`,
  });

  const currentState = await ctx.readState(taskID);

  expect(currentState).toBe('ready');
});

test('it refuses a task that is running', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.runningTask(ctx.buildSeedInput('Tides'));
  const outcome = await ctx.close(taskID);

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `${taskID} is still working, so nixie closed nothing; close it once it has finished`,
  });

  const currentState = await ctx.readState(taskID);

  expect(currentState).toBe('running');
});

test('it refuses an unknown ID', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.close('nosuchtask');

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'no task you can close has the ID nosuchtask; tasks.list gives the IDs',
  });
});

test('it refuses the conversation', async () => {
  const ctx = await setupTest();
  const taskID = await seedTask(ctx.context, ctx.buildSeedInput('Tides'));
  const claim = await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000, taskID });

  invariant(claim, 'the started task is ready to claim');

  const outcome = await ctx.close('conversation', { thread: taskID, claim });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'conversation is the conversation, which never closes',
  });
});

test('it refuses a task that no start made', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'Tidy the shelves.');
  const outcome = await ctx.close(taskID);

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `${taskID} is not a task that was started, so it cannot be closed`,
  });

  const currentState = await ctx.readState(taskID);

  expect(currentState).toBe('ready');
});

test('it refuses the thread that calls it', async () => {
  const ctx = await setupTest();
  const taskID = await seedTask(ctx.context, ctx.buildSeedInput('Tides'));
  const claim = await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000, taskID });

  invariant(claim, 'the started task is ready to claim');

  const outcome = await ctx.close(taskID, { thread: taskID, claim });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `${taskID} is your own task, and a task cannot close itself`,
  });
});

test('it refuses a call from a step that no longer holds its lease', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.waitingTask(ctx.buildSeedInput('Tides'));

  await writeTaskControl(ctx.context, { taskID: 'conversation', control: 'stop' });

  const outcome = await ctx.close(taskID);

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'this call comes from a step that no longer holds its task, so nixie closed nothing',
  });

  const currentState = await ctx.readState(taskID);

  expect(currentState).toBe('waiting');
});

test('it leaves a closed task that takes no resume, no restart and no message', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.waitingTask(ctx.buildSeedInput('Tides'));

  await ctx.close(taskID);

  const resumed = await writeTaskControl(ctx.context, { taskID, control: 'resume' });
  const restarted = await writeTaskControl(ctx.context, { taskID, control: 'restart' });

  const messaged = await writeTestTaskMessage(ctx.context, buildStartedDirectory(taskID), {
    from: 'conversation',
    to: taskID,
    kind: 'request',
    body: 'One more thing.',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  expect(resumed).toMatchObject({ status: 'refused', refusal: { reason: 'not_allowed' } });
  expect(restarted).toMatchObject({ status: 'refused', refusal: { reason: 'not_allowed' } });
  expect(messaged).toMatchObject({ status: 'refused', refusal: { reason: 'finished' } });
});

test('it keeps the report of a close that the conversation made and tells it nothing', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.waitingTask(ctx.buildSeedInput('Tides'));
  const before = await readInbox(ctx.context, 'conversation');

  await ctx.close(taskID);

  const ends = await ctx.readRunEnds();

  expect(ends).toHaveLength(1);
  expect(ends[0]).toMatchObject({ taskID, cause: 'closed', delivery: 'kept' });

  const reports = await ctx.readReportMessages();
  const inbox = await readInbox(ctx.context, 'conversation');

  expect(reports).toHaveLength(0);
  expect(inbox).toHaveLength(before.length);
});

test('it still reports to the conversation when the owner closes the task', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.waitingTask(ctx.buildSeedInput('Tides'));

  await writeTaskControl(ctx.context, { taskID, control: 'close' });

  const ends = await ctx.readRunEnds();

  expect(ends[0]).toMatchObject({
    taskID,
    cause: 'closed',
    delivery: expect.not.stringMatching(/^kept$/u),
  });

  const reports = await ctx.readReportMessages();

  expect(reports).toHaveLength(1);
});

test('it sends the conversation no message for 34 closes in one step', async () => {
  const ctx = await setupTest();
  const before = await readInbox(ctx.context, 'conversation');

  const taskIDs: string[] = [];

  for (let index = 0; index < 34; index += 1) {
    const taskID = await ctx.seed.waitingTask(ctx.buildSeedInput(`Tides ${index}`));

    taskIDs.push(taskID);
  }

  for (const taskID of taskIDs) {
    await ctx.close(taskID);
  }

  const ends = await ctx.readRunEnds();
  const closed = await ctx.readClosed();
  const reports = await ctx.readReportMessages();
  const inbox = await readInbox(ctx.context, 'conversation');

  expect(closed).toHaveLength(34);
  expect(ends).toHaveLength(34);
  expect(ends).toSatisfyAll((end: Record<string, unknown>) => end['delivery'] === 'kept');
  expect(reports).toHaveLength(0);
  expect(inbox).toHaveLength(before.length);
});

test('it declares a note effect with no destination, so the starter rule allows it', async () => {
  const ctx = await setupTest();

  const tool = buildTaskCloseTool(ctx.context, buildStartedDirectory('placeholder'));

  expect(tool.declaration).toStrictEqual({
    effects: ['note'],
    destinations: [],
    amount: null,
    content: [],
    results: {
      taskID: 'owner_data',
      name: 'owner_data',
      state: 'owner_data',
      wasClosed: 'owner_data',
    },
  });
});

test('it shows the model no sandbox in the name, description or schema of a task tool', async () => {
  const ctx = await setupTest();

  const messaging = { hopLimit: 20, ownerName: null };

  const tools = [
    buildTaskCloseTool(ctx.context, buildStartedDirectory('x')),
    buildTasksListTool(ctx.context, buildStartedDirectory('x')),
    buildTaskStartTool(ctx.context, messaging, buildMockTaskStartBounds()),
  ];

  const shown = JSON.stringify(
    tools.map((tool) => [tool.name, tool.description, tool.input, tool.output]),
  );

  // the start's runner key is the one place the word appears, as the name of the runner
  expect(shown.replace('"const":"sandbox"', '')).not.toMatch(/sandbox/iu);
});
