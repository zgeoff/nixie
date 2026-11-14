import { expect, test } from 'bun:test';
import { runProjectionRebuild } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { writeStepCommit } from '../step/write-step-commit';
import { writeTaskLimitRaise } from '../task/limit/write-task-limit-raise';
import { claimTask } from '../task/projection/claim-task';
import { writeInboxRecords } from '../task/projection/write-inbox-records';
import { writeTaskControl } from '../task/write-task-control';
import { buildTestRunSettings } from '../test-utils/build-test-run-settings';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import type { TaskClaim, TaskRunOptions, TasksTables } from '../types';
import { readEndedRuns } from './read-ended-runs';
import { readOpenRun } from './read-open-run';
import { readRunState } from './read-run-state';
import type { RunMeter, RunMeterName } from './types';

async function setupTest() {
  const tasks = await startTestTasks();

  // each meter reads the use a test gave a task run, so a carried limit shows the use it took off
  const uses = new Map<string, Readonly<Record<RunMeterName, number>>>();

  const buildMeter = (name: RunMeterName): RunMeter => ({
    name,
    read: (_, run) => Promise.resolve(uses.get(run.runID)?.[name] ?? 0),
    render: String,
  });

  const context = {
    ...tasks.context,
    runSettings: {
      ...buildTestRunSettings(),
      meters: [buildMeter('turns'), buildMeter('dollars')] as const,
    },
  };

  const starter = await seedConversationStep(context);

  return {
    ...tasks,
    context,
    db: context.log.writer.db.$extendTables<TasksTables>(),
    startTask: (options: Partial<TaskRunOptions>) =>
      seedTask(context, {
        starter: starter.claim,
        name: 'Tide tables',
        brief: 'Find the high tides for Saturday.',
        options,
      }),
    claim: async (taskID: string) => {
      const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000, taskID });

      invariant(claim, 'the task is ready to claim');

      return claim;
    },
    endAtLimit: async (claim: TaskClaim, used: Readonly<Record<RunMeterName, number>>) => {
      const run = await readOpenRun(context.log.writer.db, claim.lease.workID);

      invariant(run, 'the claim opened a task run');

      uses.set(run.runID, used);

      await writeStepCommit(context, claim, {
        next: 'continue',
        records: [],
        acknowledged: [],
        run: { activity: 'worked', limit: { meter: 'turns', used: used.turns, limit: used.turns } },
      });
    },
    readOpen: (taskID: string) => readOpenRun(context.log.writer.db, taskID),
    readEnded: (taskID: string) => readEndedRuns(context, { taskID, limit: 10 }),
  };
}

test('it keeps one task run row when the first step of a task run is claimed again', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask({});

  await ctx.claim(taskID);

  ctx.clock.advance(120_000);

  await ctx.claim(taskID);

  const rows = await ctx.db.selectFrom('task_runs').select('task_id').execute();

  expect(rows).toStrictEqual([{ task_id: taskID }]);
});

test('it rebuilds the task_runs table equal to the live one after a limit end, a raise and a report', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask({ report: 'none', limits: { turns: 1, dollars: 2 } });
  const first = await ctx.claim(taskID);

  await writeStepCommit(ctx.context, first, {
    next: 'continue',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', limit: { meter: 'turns', used: 1, limit: 1 } },
  });

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 3 } });

  const carried = await ctx.claim(taskID);

  await writeStepCommit(ctx.context, carried, {
    next: 'done',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'High tide is at 06:42.' } },
  });

  const live = await ctx.db
    .selectFrom('task_runs')
    .selectAll()
    .orderBy('opened_sequence')
    .execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db
    .selectFrom('task_runs')
    .selectAll()
    .orderBy('opened_sequence')
    .execute();

  expect(live).toHaveLength(2);
  expect(rebuilt).toStrictEqual(live);
});

test('it carries a limit-ended task run after a raise with the shape it pinned and the raised total less the use', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.startTask({
    report: 'none',
    limits: { turns: 1, dollars: 2 },
    reportShape: {
      type: 'object',
      additionalProperties: false,
      properties: { highTide: { type: 'string' } },
      required: ['highTide'],
    },
  });

  const claim = await ctx.claim(taskID);

  await ctx.endAtLimit(claim, { turns: 1, dollars: 0.5 });

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 3 } });

  await ctx.claim(taskID);

  const [ended] = await ctx.readEnded(taskID);
  const open = await ctx.readOpen(taskID);

  invariant(ended);

  expect(open?.opened).toStrictEqual({
    ...ended.opened,
    runID: expect.any(String),
    openedByStep: `${taskID}:2`,
    origin: { kind: 'raise', sequence: expect.any(Number) },
    carriesRunID: ended.runID,
    reportShape: {
      type: 'object',
      additionalProperties: false,
      properties: { highTide: { type: 'string' } },
      required: ['highTide'],
    },
    limits: { turns: 2, dollars: 1.5, calls: {} },
  });
});

test('it carries a piece of work through 2 raises with the totals less its use, and a restart with the full totals', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask({ report: 'none', limits: { turns: 40, dollars: 10 } });
  const first = await ctx.claim(taskID);

  await ctx.endAtLimit(first, { turns: 40, dollars: 3 });

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 60 } });

  const second = await ctx.claim(taskID);
  const afterFirstRaise = await ctx.readOpen(taskID);

  await ctx.endAtLimit(second, { turns: 20, dollars: 2 });

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 80 } });

  await ctx.claim(taskID);

  const afterSecondRaise = await ctx.readOpen(taskID);

  await writeTaskControl(ctx.context, { taskID, control: 'stop' });
  await writeTaskControl(ctx.context, { taskID, control: 'restart' });

  ctx.clock.advance(120_000);

  await ctx.claim(taskID);

  const afterRestart = await ctx.readOpen(taskID);

  expect([
    afterFirstRaise?.opened.limits,
    afterSecondRaise?.opened.limits,
    afterRestart?.opened.limits,
  ]).toStrictEqual([
    { turns: 20, dollars: 7, calls: {} },
    { turns: 20, dollars: 5, calls: {} },
    { turns: 80, dollars: 10, calls: {} },
  ]);
});

test('it carries a stopped task run after a restart with the full totals', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask({ limits: { turns: 4, dollars: 2 } });

  await ctx.claim(taskID);

  await writeTaskControl(ctx.context, { taskID, control: 'stop' });
  await writeTaskControl(ctx.context, { taskID, control: 'restart' });

  ctx.clock.advance(120_000);

  await ctx.claim(taskID);

  const [ended] = await ctx.readEnded(taskID);
  const open = await ctx.readOpen(taskID);

  invariant(ended);

  expect(open?.opened).toStrictEqual({
    ...ended.opened,
    runID: expect.any(String),
    openedByStep: `${taskID}:1`,
    origin: { kind: 'restart', sequence: expect.any(Number) },
    carriesRunID: ended.runID,
    limits: { turns: 4, dollars: 2, calls: {} },
  });
});

test('it opens no second carried task run at a later claim once the carried one ended', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask({ report: 'none', limits: { turns: 1, dollars: 2 } });
  const first = await ctx.claim(taskID);

  await writeStepCommit(ctx.context, first, {
    next: 'continue',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', limit: { meter: 'turns', used: 1, limit: 1 } },
  });

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 3 } });

  const carried = await ctx.claim(taskID);

  await writeStepCommit(ctx.context, carried, {
    next: 'wait',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'High tide is at 06:42.' } },
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: taskID,
    },
  ]);

  await ctx.claim(taskID);

  const open = await ctx.readOpen(taskID);

  expect({ kind: open?.opened.origin.kind, carriesRunID: open?.opened.carriesRunID }).toStrictEqual(
    {
      kind: 'owner',
      carriesRunID: null,
    },
  );
});

test('it reads a started task with an unread brief and no claim as pending', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask({});
  const state = await readRunState(ctx.context, taskID);

  expect(state).toStrictEqual({ kind: 'pending' });
});
