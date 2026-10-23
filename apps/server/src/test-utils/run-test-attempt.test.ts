import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ActionsTables } from '@heynixie/actions';
import { actionsProjection } from '@heynixie/actions';
import { logProjections, startWriter } from '@heynixie/log';
import { tasksProjections, writeInboxRecords } from '@heynixie/tasks';
import { buildTestClock } from '@heynixie/testing';
import { buildActions } from '../build-actions';
import { makeQueueCheckStep } from '../make-queue-check-step';
import { createTestStep } from './create-test-step';
import { runTestAttempt } from './run-test-attempt';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-run-test-attempt-'));

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
    db: writer.db.$extendTables<ActionsTables>(),
    log,
    connectors: actions.connectors,
    runStep: actions.trackSteps(
      makeQueueCheckStep({ context, queue: actions.queue, tool: actions.logConnector.tool }),
    ),
  };
}

test('it runs the queued action through its connector', async () => {
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

  await runTestAttempt(ctx.context, ctx.connectors);

  const actions = await ctx.db.selectFrom('actions').select(['action_id', 'status']).execute();

  expect(actions).toMatchObject([{ status: 'done' }]);

  expect(ctx.log).toHaveBeenCalledExactlyOnceWith('action.logged', {
    actionID: actions[0]?.action_id,
    attempt: 1,
  });
});

test('it throws when no queued action is claimable', async () => {
  const ctx = await setupTest();

  const attempt = runTestAttempt(ctx.context, ctx.connectors);

  await attempt.catch(() => {});

  expect(attempt).rejects.toThrowWithMessage(Error, 'no queued action was claimable');
});
