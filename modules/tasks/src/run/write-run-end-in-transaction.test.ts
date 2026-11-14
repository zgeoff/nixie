import { expect, test } from 'bun:test';
import type { RecordKind } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { writeStepCommit } from '../step/write-step-commit';
import { claimTask } from '../task/projection/claim-task';
import { writeTaskControl } from '../task/write-task-control';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import type { TaskRunOptions } from '../types';
import { readEndedRuns } from './read-ended-runs';
import { readOpenRun } from './read-open-run';

async function setupTest() {
  const tasks = await startTestTasks();
  const starter = await seedConversationStep(tasks.context);

  return {
    ...tasks,
    startTask: async (options: Partial<TaskRunOptions> = {}) => {
      const taskID = await seedTask(tasks.context, {
        starter: starter.claim,
        name: 'Tide tables',
        brief: 'Find the high tides for Saturday.',
        options,
      });

      return taskID;
    },
    claim: async (taskID: string) => {
      const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

      invariant(claim, 'the task is ready to claim');

      return claim;
    },
    readKinds: async (kind: RecordKind) => {
      const entries = await readRecords(tasks.context.log, { afterSequence: 0, kinds: [kind] });

      return entries.map((entry) => entry.record);
    },
    readEnded: (taskID: string) => readEndedRuns(tasks.context, { taskID, limit: 10 }),
  };
}

test('it opens one task run at the claim of a started task, and joins it on a rerun of the step', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask();

  await ctx.claim(taskID);

  const opened = await ctx.readKinds('task.run_opened');
  const run = await readOpenRun(ctx.context.log.writer.db, taskID);

  expect(opened).toHaveLength(1);
  expect(run?.opened.limits).toStrictEqual({ turns: 25, dollars: 2, calls: {} });
  expect(run?.opened.report).toStrictEqual({ mode: 'wake', target: 'conversation' });
});

test('it ends the task run as reported with the words the task sent, and wakes the starter with a report message', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask();
  const claim = await ctx.claim(taskID);

  await writeStepCommit(ctx.context, claim, {
    next: 'done',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'High tide is at 06:42.' } },
  });

  const [ended] = await ctx.readEnded(taskID);
  const messages = await ctx.readKinds('task_message');

  const report = messages.find((message) => message.payload['kind'] === 'report');

  expect(ended?.ended?.record).toMatchObject({
    cause: 'reported',
    delivery: 'wake',
    reportTo: 'conversation',
  });

  expect(report).toMatchObject({
    thread: 'conversation',
    payload: { from: taskID, to: 'conversation', wake: true },
  });

  expect(report?.erasable).toMatchObject({
    status: 'readable',
    fields: { body: expect.stringContaining('High tide is at 06:42.') },
  });
});

test('it keeps the report of a task started with report none, and sends no message', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask({ report: 'none' });
  const claim = await ctx.claim(taskID);

  await writeStepCommit(ctx.context, claim, {
    next: 'done',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'High tide is at 06:42.' } },
  });

  const [ended] = await ctx.readEnded(taskID);
  const messages = await ctx.readKinds('task_message');

  expect(ended?.ended?.record).toMatchObject({ cause: 'reported', delivery: 'kept' });
  expect(messages.filter((message) => message.payload['kind'] === 'report')).toStrictEqual([]);
});

test('it ends a task that finishes with no report as no_report, with a summary that nixie made', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask();
  const claim = await ctx.claim(taskID);

  await writeStepCommit(ctx.context, claim, {
    next: 'done',
    records: [],
    acknowledged: [],
    run: { activity: 'worked' },
  });

  const [ended] = await ctx.readEnded(taskID);

  expect(ended?.ended?.record.cause).toBe('no_report');
});

test('it ends a task run at a limit with the meter, holds the task, and wakes the starter with the report instead of a notice', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask({ limits: { turns: 1, dollars: 2 } });
  const claim = await ctx.claim(taskID);

  await writeStepCommit(ctx.context, claim, {
    next: 'continue',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', limit: { meter: 'turns', used: 1, limit: 1 } },
  });

  const [ended] = await ctx.readEnded(taskID);
  const notices = await ctx.readKinds('task.limit_notice');
  const reached = await ctx.readKinds('task.limit_reached');

  expect(ended?.ended?.record).toMatchObject({
    cause: 'limit',
    detail: { meter: 'turns', used: 0, limit: 1 },
    delivery: 'wake',
  });

  expect(notices).toStrictEqual([]);
  expect(reached).toHaveLength(1);
});

test('it tells the starter of a limit end that the report did not wake, with a limit notice', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask({ report: 'none', limits: { turns: 1, dollars: 2 } });
  const claim = await ctx.claim(taskID);

  await writeStepCommit(ctx.context, claim, {
    next: 'continue',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', limit: { meter: 'turns', used: 1, limit: 1 } },
  });

  const notices = await ctx.readKinds('task.limit_notice');

  expect(notices.map((notice) => notice.thread)).toStrictEqual(['conversation']);
});

test('it ends the open task run as stopped when the owner stops the task', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask();

  await ctx.claim(taskID);

  await writeTaskControl(ctx.context, { taskID, control: 'stop' });

  const [ended] = await ctx.readEnded(taskID);

  expect(ended?.ended?.record).toMatchObject({ cause: 'stopped', endedBy: 'control:stop' });
});

test('it leaves no open task run once a task reports', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask();
  const claim = await ctx.claim(taskID);

  await writeStepCommit(ctx.context, claim, {
    next: 'done',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'First answer.' } },
  });

  const open = await readOpenRun(ctx.context.log.writer.db, taskID);

  expect(open).toBeNull();

  const ended = await ctx.readEnded(taskID);

  expect(ended).toHaveLength(1);
});
