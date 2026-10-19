import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logProjections, startWriter } from '@heynixie/log';
import type { TasksTables } from '@heynixie/tasks';
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
    db: writer.db.$extendTables<TasksTables>(),
    context: {
      log: { writer, deploymentKey, projections: [...logProjections, ...tasksProjections] },
      clock: buildTestClock(1_000_000),
      definitions: () => ({ snapshotHash: 'sha256:test' }),
    },
  };
}

test('it claims the next step for runner-a with the unread inbox of its task', async () => {
  const ctx = await setupTest();

  await createTask(ctx.context, 'send the weekly summary');

  const task = await ctx.db.selectFrom('tasks').select('task_id').executeTakeFirstOrThrow();

  await writeInboxRecords(ctx.context, [
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: task.task_id,
      payload: { at: 1_000_000 },
    },
  ]);

  const step = await claimTestStep(ctx.context);

  expect(step).toMatchObject({
    taskID: task.task_id,
    stepKey: `${task.task_id}:1`,
    lease: { kind: 'task', workID: task.task_id, holder: 'runner-a', expiresAt: 1_060_000 },
    sessionBoundary: null,
  });

  expect(step.inbox).toPartiallyContain({ kind: 'task.wake', thread: task.task_id });
});

test('it throws when no task is claimable', async () => {
  const ctx = await setupTest();

  expect(claimTestStep(ctx.context)).rejects.toThrowWithMessage(Error, 'no task was claimable');
});
