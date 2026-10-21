import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { ActionsTables } from '@heynixie/actions';
import { actionsProjection, writeUnknownOutcomes } from '@heynixie/actions';
import { logProjections, readRecords, startWriter } from '@heynixie/log';
import type { StepInput, TasksContext } from '@heynixie/tasks';
import {
  tasksProjections,
  writeInboxRecords,
  writeStepCommit,
  writeStepError,
} from '@heynixie/tasks';
import { buildTestClock } from '@heynixie/testing';
import { buildActions } from './build-actions';
import { makeQueueCheckStep } from './make-queue-check-step';
import { claimTestStep } from './test-utils/claim-test-step';
import { createTestStep } from './test-utils/create-test-step';
import { runCrashedTestAttempt } from './test-utils/run-crashed-test-attempt';
import { runTestAttempt } from './test-utils/run-test-attempt';

async function setupTest() {
  const dataDir = await mkdtemp(`${tmpdir()}/nixie-queue-check-`);
  const writer = await startWriter({ dataDir });

  onTestFinished(async () => {
    await writer.stop();

    await rm(dataDir, { recursive: true, force: true });
  });

  const clock = buildTestClock(1_000_000);

  const context: TasksContext = {
    log: {
      writer,
      deploymentKey: await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
        'wrapKey',
        'unwrapKey',
      ]),
      projections: [...logProjections, ...tasksProjections, actionsProjection],
    },
    clock,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
  };

  const step = await createTestStep(context);

  const log = mock(() => {});
  const actions = buildActions(context, log);

  const runStep = actions.trackSteps(
    makeQueueCheckStep({ context, queue: actions.queue, tool: actions.logConnector.tool }),
  );

  const wake = () =>
    writeInboxRecords(context, [
      {
        kind: 'task.wake',
        definitions: context.definitions(),
        thread: step.taskID,
        payload: { at: context.clock.now() },
      },
    ]);

  return {
    context,
    log,
    db: writer.db.$extendTables<ActionsTables>(),
    step,
    runStep,
    wake,

    startAgain: async () => {
      await writeUnknownOutcomes(context);
      await wake();
    },
    runNextStep: async () => {
      const next = await claimTestStep(context);

      await runStep(next);

      return next;
    },

    failStep: async (failed: StepInput) => {
      await writeStepError(context, failed, {
        error: new Error('the step failed'),
        maxStepErrors: 3,
        retryDelayMs: 30_000,
        maxRetryDelayMs: 300_000,
      });

      clock.advance(30_000);
    },
    runNextAttempt: () => runTestAttempt(context, actions.connectors),
    runCrashedAttempt: () => runCrashedTestAttempt(context, actions.connectors),
  };
}

test('it queues one actions.log action under the step that a wake starts, allowed by slice1.queue-check', async () => {
  const ctx = await setupTest();
  const inbox = await ctx.wake();
  const result = await ctx.runStep({ ...ctx.step, inbox });
  const actions = await ctx.db.selectFrom('actions').selectAll().execute();

  const called = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['tool_called', 'tool_result'],
  });

  expect(actions).toMatchObject([
    {
      task_id: ctx.step.taskID,
      step_key: ctx.step.stepKey,
      tool: 'actions.log',
      status: 'pending',
    },
  ]);

  expect(called.map((read) => [read.record.kind, read.record.decision])).toStrictEqual([
    [
      'tool_called',
      { outcome: 'allow', stage: 3, rule: { id: 'slice1.queue-check', revision: 1 } },
    ],
    ['tool_result', null],
  ]);

  expect(result).toStrictEqual({
    next: 'wait',
    records: [],
    acknowledged: inbox.map((record) => record.sequence),
  });
});

test('it queues nothing more for the outcome of the action it queued, and reads that outcome', async () => {
  const ctx = await setupTest();

  await ctx.runStep({ ...ctx.step, inbox: await ctx.wake() });
  await ctx.runNextAttempt();

  const outcome = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['action.outcome'],
  });

  const inbox = outcome.map((read) => read.record);

  const result = await ctx.runStep({ ...ctx.step, inbox });
  const actions = await ctx.db.selectFrom('actions').select('status').execute();

  expect(actions).toStrictEqual([{ status: 'done' }]);
  expect(result.acknowledged).toStrictEqual(inbox.map((record) => record.sequence));
});

test('it queues a fresh action at the next start after a crash left the last action unknown, and the connector runs it', async () => {
  const ctx = await setupTest();
  const first = await ctx.runStep({ ...ctx.step, inbox: await ctx.wake() });

  await writeStepCommit(ctx.context, ctx.step, first);

  await ctx.runCrashedAttempt();
  await ctx.startAgain();

  const next = await ctx.runNextStep();

  await ctx.runNextAttempt();

  const actions = await ctx.db
    .selectFrom('actions')
    .select(['action_id', 'step_key', 'status'])
    .orderBy('queued_sequence')
    .execute();

  expect(actions).toMatchObject([
    { step_key: `${ctx.step.taskID}:1`, status: 'unknown' },
    { step_key: `${next.taskID}:2`, status: 'done' },
  ]);

  expect(ctx.log).toHaveBeenCalledExactlyOnceWith('action.logged', {
    actionID: actions[1]?.action_id,
    attempt: 1,
  });
});

test('it reuses the action it queued when a retry of the step runs on the same inbox', async () => {
  const ctx = await setupTest();
  const inbox = await ctx.wake();

  await ctx.runStep({ ...ctx.step, inbox });
  await ctx.failStep(ctx.step);

  const retry = await ctx.runNextStep();
  const actions = await ctx.db.selectFrom('actions').select(['action_id', 'step_key']).execute();

  const results = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['tool_result'],
  });

  expect(retry).toMatchObject({
    stepKey: ctx.step.stepKey,
    lease: { generation: ctx.step.lease.generation + 1 },
    inbox,
  });

  expect(actions).toMatchObject([{ step_key: ctx.step.stepKey }]);

  expect(results.map((read) => read.record.payload['actionID'])).toStrictEqual([
    actions[0]?.action_id,
    actions[0]?.action_id,
  ]);
});
