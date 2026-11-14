import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { actionsProjection, writeUnknownOutcomes } from '@heynixie/actions';
import { readTestActions } from '@heynixie/actions/test-utils';
import { logProjections, readRecords, startWriter } from '@heynixie/log';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import type { TasksContext } from '@heynixie/tasks';
import {
  tasksProjections,
  writeInboxRecords,
  writeStepCommit,
  writeStepError,
} from '@heynixie/tasks';
import { buildTestClock } from '@heynixie/testing';
import { buildActions } from './build-actions';
import { makeQueueCheckStep } from './make-queue-check-step';
import type { TestStep } from './test-utils/claim-test-step';
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

  const log = mock(() => {});
  const actions = buildActions(context, { log, testProviderURL: null });

  const runStep = actions.trackSteps(
    makeQueueCheckStep({
      context,
      queue: actions.queue,
      makeDecide: (findDeclaration) => readStarterDecisionPoint(findDeclaration),
      tool: actions.logConnector.tool,
    }),
  );

  const wake = (taskID: string) =>
    writeInboxRecords(context, [
      {
        kind: 'task.wake',
        definitions: context.definitions(),
        thread: taskID,
        payload: { at: context.clock.now() },
      },
    ]);

  return {
    context,
    log,
    runStep,
    wake,

    startAgain: async (taskID: string) => {
      await writeUnknownOutcomes(context);
      await wake(taskID);
    },
    runNextStep: async () => {
      const next = await claimTestStep(context);

      await runStep(next);

      return next;
    },

    failStep: async (failed: TestStep) => {
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

test('it queues one actions.log action under the step that a wake starts, allowed by the starter write rule', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const inbox = await ctx.wake(step.taskID);
  const result = await ctx.runStep({ ...step, inbox });
  const actions = await readTestActions(ctx.context.log.writer);

  const called = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['tool_called', 'tool_result'],
  });

  expect(actions).toStrictEqual([
    {
      actionID: expect.toBeString(),
      taskID: step.taskID,
      stepKey: step.stepKey,
      tool: 'actions.log',
      status: 'pending',
      attemptCount: 0,
      isAttemptOpen: false,
      nextAttemptAt: 1_000_000,
      reason: null,
      outcomeSequence: null,
    },
  ]);

  expect(called.map((read) => read.record.kind)).toStrictEqual(['tool_called', 'tool_result']);

  expect(called[0]?.record.decision).toMatchObject({
    outcome: 'allow',
    stage: 7,
    rule: { id: 'allow-service-writes', revision: 1 },
  });

  expect(result).toStrictEqual({
    next: 'wait',
    records: [],
    acknowledged: inbox.map((record) => record.sequence),
  });
});

test('it queues nothing more for the outcome of the action it queued, and reads that outcome', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await ctx.runStep({ ...step, inbox: await ctx.wake(step.taskID) });
  await ctx.runNextAttempt();

  const outcome = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['action.outcome'],
  });

  const inbox = outcome.map((read) => read.record);

  const result = await ctx.runStep({ ...step, inbox });
  const actions = await readTestActions(ctx.context.log.writer);

  expect(actions.map((action) => action.status)).toStrictEqual(['done']);
  expect(result.acknowledged).toStrictEqual(inbox.map((record) => record.sequence));
});

test('it queues a fresh action at the next start after a crash left the last action unknown, and the connector runs it', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const first = await ctx.runStep({ ...step, inbox: await ctx.wake(step.taskID) });

  await writeStepCommit(ctx.context, step, first);

  await ctx.runCrashedAttempt();
  await ctx.startAgain(step.taskID);

  const next = await ctx.runNextStep();

  await ctx.runNextAttempt();

  const actions = await readTestActions(ctx.context.log.writer);

  expect(actions.map((action) => [action.stepKey, action.status])).toStrictEqual([
    [`${step.taskID}:1`, 'unknown'],
    [`${next.taskID}:2`, 'done'],
  ]);

  expect(ctx.log).toHaveBeenCalledExactlyOnceWith('action.logged', {
    actionID: actions[1]?.actionID,
    attempt: 1,
  });
});

test('it reuses the action it queued when a retry of the step runs on the same inbox', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const inbox = await ctx.wake(step.taskID);

  await ctx.runStep({ ...step, inbox });
  await ctx.failStep(step);

  const retry = await ctx.runNextStep();
  const actions = await readTestActions(ctx.context.log.writer);

  const results = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['tool_result'],
  });

  expect(retry).toMatchObject({
    stepKey: step.stepKey,
    lease: { generation: step.lease.generation + 1 },
    inbox,
  });

  expect(actions.map((action) => action.stepKey)).toStrictEqual([step.stepKey]);

  expect(results.map((read) => read.record.payload['actionID'])).toStrictEqual([
    actions[0]?.actionID,
    actions[0]?.actionID,
  ]);
});
