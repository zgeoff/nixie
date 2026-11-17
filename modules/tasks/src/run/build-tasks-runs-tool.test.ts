import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import { recallPageLimitBytes } from '@heynixie/wire';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { writeStepCommit } from '../step/write-step-commit';
import { writeStepError } from '../step/write-step-error';
import { claimTask } from '../task/projection/claim-task';
import { writeTaskControl } from '../task/write-task-control';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedDefinitionTask } from '../test-utils/seed-definition-task';
import { seedOpenDefinitionRun } from '../test-utils/seed-open-definition-run';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import type { DefinitionVersion, TaskRunOptions } from '../types';
import { buildTasksRunsTool } from './build-tasks-runs-tool';

async function setupTest() {
  const tasks = await startTestTasks();

  const listedRunSchema = z.object({
    run: z.string(),
    outcome: z.string(),
    report: z.string(),
    source: z.string(),
  });

  const listedSchema = z.object({
    runs: z.array(listedRunSchema),
    nextCursor: z.string().nullable(),
  });

  const tool = buildTasksRunsTool(tasks.context, { directory: [] });
  let starter: Awaited<ReturnType<typeof seedConversationStep>> | undefined;

  onTestFinished(() => {
    setSystemTime();
  });

  return {
    ...tasks,
    tideShape: {
      type: 'object',
      properties: { tide: { type: 'string' } },
      required: ['tide'],
      additionalProperties: false,
    } as const,
    readListed: async (input: JSONObject) => {
      const outcome = await tool.run(
        buildMockToolCall({ tool: 'tasks.runs', input }),
        buildMockToolContext({ run: { thread: 'conversation' } }),
      );

      invariant(outcome.status === 'ok', 'the call answers');

      return {
        ...listedSchema.parse(outcome.result),
        bytes: Buffer.byteLength(JSON.stringify(outcome.result)),
      };
    },
    callRuns: (input: JSONObject) =>
      tool.run(
        buildMockToolCall({ tool: 'tasks.runs', input }),
        buildMockToolContext({ run: { thread: 'conversation' } }),
      ),

    // a task of the definition, with its version stored under the hash
    createDefinitionTask: (
      definitionID: string,
      hash: string,
      version: Partial<DefinitionVersion> = {},
    ) =>
      seedDefinitionTask(tasks, {
        definitionID,
        definitionHash: hash,
        version: { name: 'Water the tomatoes', ...version },
      }),

    // fires the definition's task, and ends its task run with a report
    endDefinitionRun: async (
      taskID: string,
      definitionID: string,
      hash: string,
      summary: string,
    ) => {
      const claim = await seedOpenDefinitionRun(tasks.context, {
        taskID,
        definitionID,
        definitionHash: hash,
      });

      await writeStepCommit(tasks.context, claim, {
        next: 'wait',
        records: [],
        acknowledged: [],
        run: { activity: 'worked', report: { summary } },
      });
    },

    // opens the task run of a task that the conversation started
    startRun: async (name: string, options: Partial<TaskRunOptions> = {}) => {
      starter ??= await seedConversationStep(tasks.context);

      const taskID = await seedTask(tasks.context, {
        starter: starter.claim,
        name,
        brief: 'Compare the tide tables.',
        options,
      });

      const claim = await claimTask(tasks.context, {
        holder: 'runner-a',
        leaseMs: 60_000,
        taskID,
      });

      invariant(claim, 'the started task is ready to claim');

      return { taskID, claim };
    },
  };
}

test('it lists the ended runs newest first with each field, and leaves an open run out', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.createDefinitionTask('water-the-tomatoes', 'hash-1');

  setSystemTime(new Date('2027-03-11T21:00:00.000Z'));

  await ctx.endDefinitionRun(taskID, 'water-the-tomatoes', 'hash-1', 'Watered the beds.');

  setSystemTime(new Date('2027-03-12T21:00:00.000Z'));

  await ctx.endDefinitionRun(taskID, 'water-the-tomatoes', 'hash-1', 'Watered the pots.');

  const open = await ctx.startRun('Tide check');
  const outcome = await ctx.callRuns({});

  expect(open.taskID).toBeString();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      runs: [
        {
          run: expect.toBeString(),
          task: taskID,
          name: 'Water the tomatoes',
          source: 'schedule',
          startedAt: '2027-03-12T21:00:00.000Z',
          endedAt: '2027-03-12T21:00:00.000Z',
          outcome: 'done',
          report: 'Watered the pots.',
          isReportClipped: false,
        },
        {
          run: expect.toBeString(),
          task: taskID,
          name: 'Water the tomatoes',
          source: 'schedule',
          startedAt: '2027-03-11T21:00:00.000Z',
          endedAt: '2027-03-11T21:00:00.000Z',
          outcome: 'done',
          report: 'Watered the beds.',
          isReportClipped: false,
        },
      ],
      nextCursor: null,
    },
  });
});

test('it lists a run of a started task with the source started and the name it started with', async () => {
  const ctx = await setupTest();
  const started = await ctx.startRun('Tide check');

  await writeStepCommit(ctx.context, started.claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'High tide is at noon.' } },
  });

  const outcome = await ctx.callRuns({});

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      runs: [
        {
          run: expect.toBeString(),
          task: started.taskID,
          name: 'Tide check',
          source: 'started',
          startedAt: expect.toBeString(),
          endedAt: expect.toBeString(),
          outcome: 'done',
          report: 'High tide is at noon.',
          isReportClipped: false,
        },
      ],
      nextCursor: null,
    },
  });
});

test.each([
  {
    name: 'schedule',
    trigger: { schedule: { every: 'day', at: '21:00', zone: 'UTC', catchUp: 'once' } },
    source: 'schedule',
  },
  { name: 'one-off', trigger: { at: '2027-03-11T21:00:00Z' }, source: 'one-off' },
  { name: 'no trigger', trigger: null, source: 'schedule' },
] as const)('it gives a run of a definition with $name the source $source', async (row) => {
  const ctx = await setupTest();

  const taskID = await ctx.createDefinitionTask('water-the-tomatoes', 'hash-1', {
    trigger: row.trigger,
  });

  await ctx.endDefinitionRun(taskID, 'water-the-tomatoes', 'hash-1', 'Watered the beds.');

  const listed = await ctx.readListed({});

  expect(listed.runs.map((run) => run.source)).toStrictEqual([row.source]);
});

test('it names a run of a definition that left force by the version its run pinned', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: null,
    version: { name: 'Water the tomatoes', trigger: { at: '2027-03-11T21:00:00Z' } },
  });

  await ctx.endDefinitionRun(taskID, 'water-the-tomatoes', 'water-the-tomatoes-spent', 'Watered.');

  const outcome = await ctx.callRuns({});

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      runs: [
        expect.objectContaining({
          name: 'Water the tomatoes',
          source: 'one-off',
        }),
      ],
      nextCursor: null,
    },
  });
});

test('it lists only the runs of the definition that the call names', async () => {
  const ctx = await setupTest();
  const tomatoes = await ctx.createDefinitionTask('water-the-tomatoes', 'hash-1');

  const beans = await ctx.createDefinitionTask('pick-the-beans', 'hash-2', {
    name: 'Pick the beans',
  });

  await ctx.endDefinitionRun(tomatoes, 'water-the-tomatoes', 'hash-1', 'Watered.');
  await ctx.endDefinitionRun(beans, 'pick-the-beans', 'hash-2', 'Picked.');

  const outcome = await ctx.callRuns({ definition: 'pick-the-beans' });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      runs: [expect.objectContaining({ task: beans, report: 'Picked.' })],
      nextCursor: null,
    },
  });
});

test('it lists only the runs that ended at or after since', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.createDefinitionTask('water-the-tomatoes', 'hash-1');

  setSystemTime(new Date('2027-03-11T21:00:00.000Z'));

  await ctx.endDefinitionRun(taskID, 'water-the-tomatoes', 'hash-1', 'Watered the beds.');

  setSystemTime(new Date('2027-03-12T21:00:00.000Z'));

  await ctx.endDefinitionRun(taskID, 'water-the-tomatoes', 'hash-1', 'Watered the pots.');

  const outcome = await ctx.callRuns({ since: '2027-03-12T21:00:00+00:00' });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      runs: [expect.objectContaining({ report: 'Watered the pots.' })],
      nextCursor: null,
    },
  });
});

test('it refuses a since that is not a date-time with an offset', async () => {
  const ctx = await setupTest();

  expect(ctx.callRuns({ since: '2027-03-12' })).rejects.toThrow();
});

test('it lists a run that reported as done, one that reached a limit as failed, and one that was closed as closed', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.createDefinitionTask('water-the-tomatoes', 'hash-1');

  await ctx.endDefinitionRun(taskID, 'water-the-tomatoes', 'hash-1', 'Watered the beds.');

  const limited = await ctx.startRun('Tide check');

  await writeStepCommit(ctx.context, limited.claim, {
    next: 'continue',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', limit: { meter: 'turns', used: 25, limit: 25 } },
  });

  const closed = await ctx.startRun('Dune check');

  await writeTaskControl(ctx.context, { taskID: closed.taskID, control: 'close' });

  const done = await ctx.readListed({ outcome: 'done' });
  const failed = await ctx.readListed({ outcome: 'failed' });
  const closedRuns = await ctx.readListed({ outcome: 'closed' });

  expect(
    [done, failed, closedRuns].map((page) => page.runs.map((run) => run.outcome)),
  ).toStrictEqual([['done'], ['failed'], ['closed']]);
});

test('it lists a run with a cause that no release knows as failed', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.createDefinitionTask('water-the-tomatoes', 'hash-1');

  await ctx.endDefinitionRun(taskID, 'water-the-tomatoes', 'hash-1', 'Watered the beds.');

  await sql`update task_runs set ended = json_set(ended, '$.cause', 'mystery')`.execute(
    ctx.writer.db,
  );

  const failed = await ctx.callRuns({ outcome: 'failed' });
  const done = await ctx.callRuns({ outcome: 'done' });

  expect([failed, done]).toStrictEqual([
    {
      status: 'ok',
      result: { runs: [expect.objectContaining({ outcome: 'failed' })], nextCursor: null },
    },
    { status: 'ok', result: { runs: [], nextCursor: null } },
  ]);
});

test('it pages 90 runs with long reports under the output limit, listing each once', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.createDefinitionTask('water-the-tomatoes', 'hash-1');

  const longReport = 'Watered the beds. '.repeat(300);

  for (let count = 0; count < 90; count += 1) {
    await ctx.endDefinitionRun(taskID, 'water-the-tomatoes', 'hash-1', longReport);
  }

  const seen: string[] = [];
  const sizes: number[] = [];
  let next: string | null = null;
  let pages = 0;

  do {
    const input = next === null ? {} : { cursor: next };

    const page = await ctx.readListed(input);

    sizes.push(page.bytes);
    seen.push(...page.runs.map((run) => run.run));

    next = page.nextCursor;
    pages += 1;
  } while (next !== null);

  expect(pages).toBeGreaterThan(1);
  expect(sizes).toSatisfyAll((size: number) => size <= recallPageLimitBytes);
  expect(seen).toHaveLength(90);
  expect(new Set(seen).size).toBe(90);
});

test('it returns a tool error for a cursor it did not give', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.callRuns({ cursor: 'not-a-cursor' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'that cursor is not one tasks.runs gave; call tasks.runs again with no cursor',
  });
});

test('it clips a listed report to its first line, and gives the whole report for the run', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.createDefinitionTask('water-the-tomatoes', 'hash-1');

  await ctx.endDefinitionRun(
    taskID,
    'water-the-tomatoes',
    'hash-1',
    'Watered the beds.\nThe pots were dry too.',
  );

  const listed = await ctx.callRuns({});
  const page = await ctx.readListed({});

  const runID = page.runs[0]?.run;

  invariant(runID !== undefined, 'a run is listed');

  const one = await ctx.callRuns({ run: runID, outcome: 'failed' });

  expect(listed).toStrictEqual({
    status: 'ok',
    result: {
      runs: [
        expect.objectContaining({
          report: 'Watered the beds.',
          isReportClipped: true,
        }),
      ],
      nextCursor: null,
    },
  });

  expect(one).toStrictEqual({
    status: 'ok',
    result: {
      runs: [
        {
          run: runID,
          task: taskID,
          name: 'Water the tomatoes',
          source: 'schedule',
          startedAt: expect.toBeString(),
          endedAt: expect.toBeString(),
          outcome: 'done',
          report: 'Watered the beds.\nThe pots were dry too.',
          isReportClipped: false,
          cause: 'reported',
          steps: 1,
          turns: 0,
          dollars: 0,
        },
      ],
      nextCursor: null,
    },
  });
});

test('it gives the message of the failing step as the reason a failed run gives', async () => {
  const ctx = await setupTest();
  const started = await ctx.startRun('Tide check');

  await writeStepError(ctx.context, started.claim, {
    maxStepErrors: 1,
    retryDelayMs: 1000,
    maxRetryDelayMs: 1000,
    error: new Error('the tide table is unreachable'),
  });

  const listed = await ctx.readListed({});

  const runID = listed.runs[0]?.run;

  invariant(runID !== undefined, 'a failed run is listed');

  const one = await ctx.callRuns({ run: runID });

  expect(one).toStrictEqual({
    status: 'ok',
    result: {
      runs: [
        expect.objectContaining({
          outcome: 'failed',
          cause: 'failed',
          reason: 'the tide table is unreachable',
        }),
      ],
      nextCursor: null,
    },
  });
});

test('it names the meter, the amount used and the limit as the reason a run that hit a limit gives', async () => {
  const ctx = await setupTest();
  const started = await ctx.startRun('Tide check');

  await writeStepCommit(ctx.context, started.claim, {
    next: 'continue',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', limit: { meter: 'turns', used: 25, limit: 25 } },
  });

  const listed = await ctx.readListed({});

  const runID = listed.runs[0]?.run;

  invariant(runID !== undefined, 'a run is listed');

  const one = await ctx.callRuns({ run: runID });

  expect(one).toStrictEqual({
    status: 'ok',
    result: {
      runs: [
        expect.objectContaining({
          cause: 'limit',
          reason: 'the run used 0 turns of its limit of 25',
        }),
      ],
      nextCursor: null,
    },
  });
});

test('it returns a tool error for a run ID that no ended run has', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.callRuns({ run: 'nosuchrun' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'no ended task run has the ID nosuchrun; call tasks.runs with no run to see the IDs',
  });
});

test('it shows the fixed text for a report whose text was forgotten', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.createDefinitionTask('water-the-tomatoes', 'hash-1');

  await ctx.endDefinitionRun(taskID, 'water-the-tomatoes', 'hash-1', 'Watered the beds.');

  const [ended] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['task.run_ended'],
  });

  invariant(ended, 'the run ended');

  await removeTestRecordKey(ctx.context.log, ended.record.sequence);

  const outcome = await ctx.callRuns({});

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      runs: [
        expect.objectContaining({
          report: '[a report whose text is no longer stored]',
          isReportClipped: false,
        }),
      ],
      nextCursor: null,
    },
  });
});

test('it gives the fields of the report for the run', async () => {
  const ctx = await setupTest();
  const started = await ctx.startRun('Tide check', { reportShape: ctx.tideShape });

  await writeStepCommit(ctx.context, started.claim, {
    next: 'continue',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'Checked.', fields: { tide: 'high' } } },
  });

  await writeTaskControl(ctx.context, { taskID: started.taskID, control: 'close' });

  const listed = await ctx.readListed({});

  const runID = listed.runs[0]?.run;

  invariant(runID !== undefined, 'a run is listed');

  const one = await ctx.callRuns({ run: runID });

  expect(one).toStrictEqual({
    status: 'ok',
    result: {
      runs: [expect.objectContaining({ report: 'Checked.', fields: { tide: 'high' } })],
      nextCursor: null,
    },
  });
});

test('it gives the declared fields that a code-made report lacks as missing for the run', async () => {
  const ctx = await setupTest();
  const started = await ctx.startRun('Tide check', { reportShape: ctx.tideShape });

  await writeTaskControl(ctx.context, { taskID: started.taskID, control: 'close' });

  const listed = await ctx.readListed({});

  const runID = listed.runs[0]?.run;

  invariant(runID !== undefined, 'a run is listed');

  const one = await ctx.callRuns({ run: runID });

  expect(one).toStrictEqual({
    status: 'ok',
    result: {
      runs: [expect.objectContaining({ missing: ['tide'] })],
      nextCursor: null,
    },
  });
});

test('it leaves fields and missing out for the run of a task with no report shape', async () => {
  const ctx = await setupTest();
  const started = await ctx.startRun('Tide check');

  await writeTaskControl(ctx.context, { taskID: started.taskID, control: 'close' });

  const listed = await ctx.readListed({});

  const runID = listed.runs[0]?.run;

  invariant(runID !== undefined, 'a run is listed');

  const outcome = await ctx.callRuns({ run: runID });

  invariant(outcome.status === 'ok', 'the call answers');

  const rowSchema = z.record(z.string(), z.unknown());
  const rowsSchema = z.object({ runs: z.array(rowSchema) });
  const parsed = rowsSchema.parse(outcome.result);
  const [row] = parsed.runs;

  expect(row).toBeDefined();
  expect(row).not.toHaveProperty('fields');
  expect(row).not.toHaveProperty('missing');
});

test('it names the one run by the version that the newest ended run of its task pins', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.createDefinitionTask('tend-the-garden', 'garden-old', {
    name: 'Old garden',
  });

  await ctx.endDefinitionRun(taskID, 'tend-the-garden', 'garden-old', 'Tended.');

  await seedDefinitionTask(ctx, {
    definitionID: 'tend-the-garden',
    definitionHash: null,
    version: { name: 'New garden' },
  });

  await ctx.endDefinitionRun(taskID, 'tend-the-garden', 'tend-the-garden-spent', 'Tended again.');

  const listed = await ctx.readListed({});

  const olderID = listed.runs[1]?.run;

  invariant(olderID !== undefined, 'two runs are listed');

  const one = await ctx.callRuns({ run: olderID });

  expect(one).toStrictEqual({
    status: 'ok',
    result: { runs: [expect.objectContaining({ name: 'New garden' })], nextCursor: null },
  });

  const names = await ctx.callRuns({});

  expect(names).toStrictEqual({
    status: 'ok',
    result: {
      runs: [
        expect.objectContaining({ name: 'New garden' }),
        expect.objectContaining({ name: 'New garden' }),
      ],
      nextCursor: null,
    },
  });
});

test('it names a run by the version that the open run of its task pins, over the newest ended one', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.createDefinitionTask('tend-the-garden', 'garden-old', {
    name: 'Old garden',
  });

  await ctx.endDefinitionRun(taskID, 'tend-the-garden', 'garden-old', 'Tended.');

  await seedDefinitionTask(ctx, {
    definitionID: 'tend-the-garden',
    definitionHash: null,
    version: { name: 'New garden' },
  });

  await seedOpenDefinitionRun(ctx.context, {
    taskID,
    definitionID: 'tend-the-garden',
    definitionHash: 'tend-the-garden-spent',
  });

  const names = await ctx.callRuns({});

  expect(names).toStrictEqual({
    status: 'ok',
    result: { runs: [expect.objectContaining({ name: 'New garden' })], nextCursor: null },
  });
});

test('it reads past forgotten failure messages to the newest one still readable', async () => {
  const ctx = await setupTest();
  const started = await ctx.startRun('Tide check');

  const options = { maxStepErrors: 11, retryDelayMs: 1000, maxRetryDelayMs: 1000 };

  await writeStepError(ctx.context, started.claim, {
    ...options,
    error: new Error('first readable error'),
  });

  for (let errors = 2; errors <= 11; errors += 1) {
    ctx.clock.advance(1000);

    const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

    invariant(claim, 'the task is claimable again');

    await writeStepError(ctx.context, claim, {
      ...options,
      error: new Error(`error ${String(errors)}`),
    });
  }

  const errors = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['task.step_errored'],
    order: 'newest',
    limit: 10,
  });

  for (const entry of errors) {
    await removeTestRecordKey(ctx.context.log, entry.record.sequence);
  }

  const listed = await ctx.readListed({});

  const runID = listed.runs[0]?.run;

  invariant(runID !== undefined, 'a failed run is listed');

  const one = await ctx.callRuns({ run: runID });

  expect(one).toStrictEqual({
    status: 'ok',
    result: {
      runs: [expect.objectContaining({ reason: 'first readable error' })],
      nextCursor: null,
    },
  });
});
