import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logProjections, startWriter } from '@heynixie/log';
import { createTask, tasksProjections, writeInboxRecords } from '@heynixie/tasks';
import { buildTestClock } from '@heynixie/testing';
import { claimTestStep } from './claim-test-step';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-claim-test-step-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    context: {
      log: { writer, deploymentKey, projections: [...logProjections, ...tasksProjections] },
      clock: buildTestClock(1_000_000),
      definitions: () => ({ snapshotHash: 'sha256:test' }),
    },
  };
}

test('it claims the next step for runner-a with the unread inbox of its task', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'send the weekly summary');

  await writeInboxRecords(ctx.context, [
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: taskID,
      payload: { at: 1_000_000 },
    },
  ]);

  const step = await claimTestStep(ctx.context);

  expect(step).toMatchObject({
    taskID,
    stepKey: `${taskID}:1`,
    lease: { kind: 'task', workID: taskID, holder: 'runner-a', expiresAt: 1_060_000 },
    sessionBoundary: null,
    startSequence: expect.any(Number),
  });

  expect(step.inbox).toPartiallyContain({ kind: 'task.wake', thread: taskID });
});

test('it throws when no task is claimable', async () => {
  const ctx = await setupTest();

  const claim = claimTestStep(ctx.context);

  await claim.catch(() => {});

  expect(claim).rejects.toThrowWithMessage(Error, 'no task was claimable');
});
