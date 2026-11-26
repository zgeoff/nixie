import { expect, test } from 'bun:test';
import { readSpendLedger } from '@heynixie/budgets';
import type { RecordKind } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { writeStepCommit } from '../step/write-step-commit';
import { writeTaskLimitRaise } from '../task/limit/write-task-limit-raise';
import { claimTask } from '../task/projection/claim-task';
import { writeTaskControl } from '../task/write-task-control';
import { buildTestRunSettings } from '../test-utils/build-test-run-settings';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedDefinitionTask } from '../test-utils/seed-definition-task';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { writeTestTriggerFire } from '../test-utils/write-test-trigger-fire';
import type { StartedClaim, TaskRunOptions } from '../types';
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
    startTaskBy: (by: StartedClaim) =>
      seedTask(tasks.context, {
        starter: by,
        name: 'Ferry times',
        brief: 'Find the first ferry on Sunday.',
      }),
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

test('it sets the ledger row of the task run to its dollars in the transaction of its end', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask();
  const claim = await ctx.claim(taskID);

  const priced = {
    ...ctx.context,
    runSettings: buildTestRunSettings({ used: { turns: 3, dollars: 0.41 } }),
  };

  await writeStepCommit(priced, claim, {
    next: 'done',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'High tide is at 06:42.' } },
  });

  const [ended] = await ctx.readKinds('task.run_ended');

  const runID = ended?.payload['runID'];

  invariant(typeof runID === 'string');

  const ledger = await readSpendLedger(ctx.writer.db);

  expect(ledger).toStrictEqual([
    {
      counter: `task_run:${runID}`,
      unit: 'micros:USD',
      periodKind: 'none',
      periodStart: '',
      amount: 410_000,
    },
  ]);
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
  const taskID = await ctx.startTask({ report: 'next_turn', limits: { turns: 1, dollars: 2 } });
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

test('it tells the starter of a started task run that pinned no report target, with a limit notice', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask({ report: 'none', limits: { turns: 1, dollars: 2 } });
  const claim = await ctx.claim(taskID);

  await writeStepCommit(ctx.context, claim, {
    next: 'continue',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', limit: { meter: 'turns', used: 1, limit: 1 } },
  });

  const result = await ctx.readKinds('task.limit_notice');

  expect(result.map((notice) => notice.thread)).toStrictEqual(['conversation']);
});

test('it sends no limit notice for a task run of a definition that pinned no report target', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    policy: { report: 'none', limits: { turns: 1, dollars: 2, calls: {} } },
  });

  await writeTestTriggerFire(ctx.context, taskID, { definitionHash: 'hash-1' });

  const claim = await ctx.claim(taskID);

  await writeStepCommit(ctx.context, claim, {
    next: 'continue',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', limit: { meter: 'turns', used: 1, limit: 1 } },
  });

  const result = await ctx.readKinds('task.limit_notice');

  expect(result).toStrictEqual([]);
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

test('it joins the open task run when a crashed step is claimed again, so the rerun sends exactly one report', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask();

  await ctx.claim(taskID);

  ctx.clock.advance(120_000);

  const rerun = await ctx.claim(taskID);

  await writeStepCommit(ctx.context, rerun, {
    next: 'done',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'High tide is at 06:42.' } },
  });

  const opened = await ctx.readKinds('task.run_opened');
  const ended = await ctx.readKinds('task.run_ended');
  const messages = await ctx.readKinds('task_message');

  expect(opened).toHaveLength(1);
  expect(ended).toHaveLength(1);
  expect(messages.filter((message) => message.payload['kind'] === 'report')).toHaveLength(1);
});

test('it opens a task run that carries the limit-ended one, with the raised total, when the owner raises the limit', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask({ report: 'none', limits: { turns: 1, dollars: 2 } });
  const claim = await ctx.claim(taskID);

  await writeStepCommit(ctx.context, claim, {
    next: 'continue',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', limit: { meter: 'turns', used: 1, limit: 1 } },
  });

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 3 } });

  await ctx.claim(taskID);

  const [first] = await ctx.readEnded(taskID);
  const open = await readOpenRun(ctx.context.log.writer.db, taskID);

  expect(open?.opened.carriesRunID).toBe(first?.runID ?? null);
  expect(open?.opened.origin.kind).toBe('raise');
  expect(open?.opened.limits).toStrictEqual({ turns: 3, dollars: 2, calls: {} });
});

test.each([
  ['wake', 'wake', 1, { wake: true, woke: true }],
  ['next_turn', 'next_turn', 1, { wake: false, woke: false }],
  ['none', 'kept', 0, { wake: false, woke: false }],
] as const)(
  'it delivers a report under the mode %s as %s',
  async (mode, delivery, messageCount, wakes) => {
    const ctx = await setupTest();
    const taskID = await ctx.startTask({ report: mode });
    const claim = await ctx.claim(taskID);

    await writeStepCommit(ctx.context, claim, {
      next: 'done',
      records: [],
      acknowledged: [],
      run: { activity: 'worked', report: { summary: 'High tide is at 06:42.' } },
    });

    const [ended] = await ctx.readEnded(taskID);
    const messages = await ctx.readKinds('task_message');

    const reports = messages.filter((message) => message.payload['kind'] === 'report');

    expect(ended?.ended?.record.delivery).toBe(delivery);

    expect(
      reports.map((report) => ({ wake: report.payload['wake'], woke: report.payload['woke'] })),
    ).toStrictEqual(Array.from({ length: messageCount }, () => wakes));
  },
);

test('it writes the summary nixie made and the missing fields when a task with a shape stops at its limit', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.startTask({
    limits: { turns: 1, dollars: 2 },
    reportShape: {
      type: 'object',
      additionalProperties: false,
      properties: { highTide: { type: 'string' }, lowTide: { type: 'string' } },
      required: ['highTide'],
    },
  });

  const claim = await ctx.claim(taskID);

  await writeStepCommit(ctx.context, claim, {
    next: 'continue',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', limit: { meter: 'turns', used: 1, limit: 1 } },
  });

  const [ended] = await ctx.readKinds('task.run_ended');
  const reports = await ctx.readKinds('task_message');

  const body = [
    'report:',
    '  summary: The run stopped at its 1 turns limit before it wrote a summary.',
    '  missing:',
    '    - highTide',
    '    - lowTide',
  ].join('\n');

  expect(ended?.erasable).toStrictEqual({ status: 'readable', fields: { body } });

  expect(
    reports
      .filter((report) => report.payload['kind'] === 'report')
      .map((report) => ({ thread: report.thread, erasable: report.erasable })),
  ).toStrictEqual([{ thread: 'conversation', erasable: { status: 'readable', fields: { body } } }]);
});

test('it delivers a report to a starter that already sent its own report, with a wake', async () => {
  const ctx = await setupTest();
  const parentID = await ctx.startTask();
  const parent = await ctx.claim(parentID);
  const childID = await ctx.startTaskBy(parent);

  await writeStepCommit(ctx.context, parent, {
    next: 'wait',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'I started the ferry task.' } },
  });

  const child = await ctx.claim(childID);

  await writeStepCommit(ctx.context, child, {
    next: 'done',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'The first ferry leaves at 07:10.' } },
  });

  const [ended] = await ctx.readEnded(childID);
  const messages = await ctx.readKinds('task_message');

  expect(ended?.ended?.record.delivery).toBe('wake');

  expect(
    messages
      .filter((message) => message.payload['kind'] === 'report')
      .map((message) => message.thread),
  ).toStrictEqual(['conversation', parentID]);
});

test('it delivers the report of a stopped task run with a wake when its newest step is inside the hop limit', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask();

  await ctx.claim(taskID);

  await writeTaskControl(ctx.context, { taskID, control: 'stop' });

  const [ended] = await ctx.readEnded(taskID);

  expect(ended?.ended?.record.delivery).toBe('wake');
});
