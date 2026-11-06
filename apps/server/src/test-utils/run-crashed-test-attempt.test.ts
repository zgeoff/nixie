import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actionsProjection } from '@heynixie/actions';
import { readTestActions } from '@heynixie/actions/test-utils';
import { logProjections, startWriter } from '@heynixie/log';
import { tasksProjections, writeInboxRecords } from '@heynixie/tasks';
import { buildTestClock } from '@heynixie/testing';
import { buildActions } from '../build-actions';
import { makeQueueCheckStep } from '../make-queue-check-step';
import { createTestStep } from './create-test-step';
import { runCrashedTestAttempt } from './run-crashed-test-attempt';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-run-crashed-test-attempt-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const context = {
    log: {
      writer,
      deploymentKey,
      projections: [...logProjections, ...tasksProjections, actionsProjection],
    },
    clock: buildTestClock(1_000_000),
    definitions: () => ({ snapshotHash: 'sha256:test' }),
  };

  const log = mock(() => {});
  const actions = buildActions(context, { log, testProviderURL: null });

  return {
    context,
    log,
    connectors: actions.connectors,
    runStep: actions.trackSteps(
      makeQueueCheckStep({ context, queue: actions.queue, tool: actions.logConnector.tool }),
    ),
  };
}

test('it stops the attempt once its attempt record commits, before the connector runs', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const inbox = await writeInboxRecords(ctx.context, [
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: step.taskID,
      payload: { at: 1_000_000 },
    },
  ]);

  await ctx.runStep({ ...step, inbox });

  await runCrashedTestAttempt(ctx.context, ctx.connectors);

  const actions = await readTestActions(ctx.context);

  expect(
    actions.map((action) => ({
      attemptCount: action.attemptCount,
      isAttemptOpen: action.isAttemptOpen,
    })),
  ).toStrictEqual([{ attemptCount: 1, isAttemptOpen: true }]);

  expect(ctx.log).not.toHaveBeenCalled();
});

test('it throws the failure of an attempt that finds no queued action', async () => {
  const ctx = await setupTest();

  const attempt = runCrashedTestAttempt(ctx.context, ctx.connectors);

  await attempt.catch(() => {});

  expect(attempt).rejects.toThrowWithMessage(Error, 'no queued action was claimable');
});
