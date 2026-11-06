import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logProjections, startWriter } from '@heynixie/log';
import { tasksProjections } from '@heynixie/tasks';
import { readTestTasks } from '@heynixie/tasks/test-utils';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { createTestStep } from './create-test-step';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-test-step-'));

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

test('it returns the first step of a new task that a runner claimed', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const [task] = await readTestTasks(ctx.context);

  invariant(task);

  expect(step).toStrictEqual({
    taskID: task.id,
    stepKey: `${task.id}:1`,
    lease: {
      kind: 'task',
      workID: task.id,
      holder: 'runner-a',
      generation: 1,
      epoch: 1,
      expiresAt: 1_060_000,
    },
    inbox: [],
    wake: { hop: 0, cause: { kind: 'carried' } },
    sessionBoundary: null,
    startSequence: expect.any(Number),
    signal: step.signal,
    interrupt: step.interrupt,
  });

  expect(step.signal).toBeInstanceOf(AbortSignal);
});

test('it leaves the task running under the step', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const tasks = await readTestTasks(ctx.context);

  expect(tasks.map((task) => [task.id, task.state])).toStrictEqual([[step.taskID, 'running']]);
});
