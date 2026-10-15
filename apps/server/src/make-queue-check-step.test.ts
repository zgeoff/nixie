import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { ActionAttemptOptions, ActionsTables } from '@heynixie/actions';
import {
  actionsProjection,
  claimAction,
  runActionAttempt,
  writeUnknownOutcomes,
} from '@heynixie/actions';
import type { LogRecord, Writer } from '@heynixie/log';
import { logProjections, readRecords, startWriter } from '@heynixie/log';
import type { StepInput, TasksContext } from '@heynixie/tasks';
import {
  claimTask,
  readInbox,
  setFaultPointHandler,
  tasksProjections,
  writeInboxRecords,
  writeStepCommit,
  writeStepError,
} from '@heynixie/tasks';
import type { TestClock } from '@heynixie/testing';
import { buildTestClock } from '@heynixie/testing';
import { buildActions } from './build-actions';
import { makeQueueCheckStep } from './make-queue-check-step';
import { createTestStep } from './test-utils/create-test-step';

// a writer with the tasks and actions projections on a test clock, a claimed step, the queue
// check's step behind the action queue's step tracking, a recorder of the connector's log lines,
// and the wakes, steps and attempts the tests drive
async function setupTest() {
  const writer = await startTestWriter();

  const clock = buildTestClock(1_000_000);

  const context = await buildActionsContext(writer, clock);
  const step = await createTestStep(context);

  const log = mock(() => {});
  const actions = buildActions(context, log);

  const runStep = actions.trackSteps(
    makeQueueCheckStep({ context, queue: actions.queue, tool: actions.logConnector.tool }),
  );

  return {
    context,
    log,
    db: writer.db.$extendTables<ActionsTables>(),
    step,
    runStep,
    wake: () => writeWake(context, step.taskID),

    // a start after a crash: recovery marks each attempt without a result unknown, then the start
    // writes its own wake
    startAgain: async () => {
      await writeUnknownOutcomes(context);
      await writeWake(context, step.taskID);
    },
    runNextStep: async () => {
      const next = await claimNextStep(context);

      await runStep(next);

      return next;
    },

    // the step fails, and the clock moves to its retry
    failStep: async (failed: StepInput) => {
      await writeStepError(context, failed, { error: new Error('the step failed'), ...stepRetry });

      clock.advance(stepRetry.retryDelayMs);
    },
    runNextAttempt: () => runNextAttempt(context, actions.connectors),
    runCrashedAttempt: () => runCrashedAttempt(context, actions.connectors),
  };
}

const stepRetry = { maxStepErrors: 3, retryDelayMs: 30_000, maxRetryDelayMs: 300_000 };

// starts a writer on a fresh data directory, and stops it and removes the directory when the test
// finishes
async function startTestWriter(): Promise<Writer> {
  const dataDir = await mkdtemp(`${tmpdir()}/nixie-queue-check-`);
  const writer = await startWriter({ dataDir });

  onTestFinished(async () => {
    await writer.stop();

    await rm(dataDir, { recursive: true, force: true });
  });

  return writer;
}

async function buildActionsContext(writer: Writer, clock: TestClock): Promise<TasksContext> {
  return {
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
}

function writeWake(context: TasksContext, taskID: string): Promise<readonly LogRecord[]> {
  return writeInboxRecords(context, [
    {
      kind: 'task.wake',
      definitions: context.definitions(),
      thread: taskID,
      payload: { at: context.clock.now() },
    },
  ]);
}

// claims the next step the way a task runner does, with its task's unread inbox
async function claimNextStep(context: TasksContext): Promise<StepInput> {
  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null) {
    throw new Error('no task was claimable');
  }

  return {
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: await readInbox(context, claim.lease.workID),
    sessionBoundary: null,
    signal: new AbortController().signal,
  };
}

async function runNextAttempt(context: TasksContext, connectors: Connectors): Promise<void> {
  const lease = await claimAction(context, { holder: 'action-runner', leaseMs: 60_000 });

  if (lease === null) {
    throw new Error('no queued action was claimable');
  }

  await runActionAttempt(context, lease, { connectors, leaseMs: 60_000 });
}

type Connectors = ActionAttemptOptions['connectors'];

// runs the next attempt as nixie dies once its attempt record commits, before the connector runs
async function runCrashedAttempt(context: TasksContext, connectors: Connectors): Promise<void> {
  setFaultPointHandler((id) => {
    if (id === 'attempt.record.after') {
      throw new Error('nixie died');
    }
  });

  try {
    await runNextAttempt(context, connectors);
  } catch (error) {
    if (error instanceof Error && error.message === 'nixie died') {
      return;
    }

    throw error;
  } finally {
    setFaultPointHandler(null);
  }

  throw new Error('the attempt outlived its attempt record');
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
