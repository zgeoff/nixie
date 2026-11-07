import { expect, mock, onTestFinished, test } from 'bun:test';
import type { Sandbox } from '@heynixie/sandbox';
import { buildMockSandbox } from '@heynixie/sandbox/test-utils';
import type { Actor } from 'xstate';
import { createActor } from 'xstate';
import type { TaskImp, TaskImpParts } from './task-imp-machine';
import { taskImpMachine } from './task-imp-machine';
import { buildStubToolEndpoint } from './test-utils/build-stub-tool-endpoint';

function setupTest() {
  const imps: Actor<typeof taskImpMachine>[] = [];

  onTestFinished(() => {
    for (const imp of imps) {
      imp.stop();
    }
  });

  const start = (parts: TaskImpParts) => {
    const imp = createActor(taskImpMachine, { input: parts });

    imp.start();
    imps.push(imp);

    return {
      imp,
      acquire: () => {
        const acquired = Promise.withResolvers<TaskImp>();

        imp.send({ type: 'acquire', reply: acquired });

        return acquired.promise;
      },
      release: () => {
        const released = Promise.withResolvers<void>();

        imp.send({ type: 'release', reply: released });

        return released.promise;
      },
      remove: () => {
        const removed = Promise.withResolvers<number>();

        imp.send({ type: 'remove', reply: removed });

        return removed.promise;
      },
    };
  };

  const run = {
    toolUseMetaKey: null,
    runID: 'k3vq8m2xpa',
    thread: 'k3vq8m2xpa',
    tools: ['time.now'],
    model: { model: 'claude-test-1', profile: 'errands' },
  };

  return { start, run };
}

test('it acquires a new imp on a started endpoint', async () => {
  const ctx = setupTest();
  const tools = buildStubToolEndpoint();
  const sandbox = buildMockSandbox({ id: 'imp-a' });

  const task = ctx.start({
    startEndpoint: () => tools.endpoint.startRun(ctx.run),
    readSandbox: () => Promise.resolve(null),
    createSandbox: () => Promise.resolve({ sandbox, isKept: false }),
    removeSandboxes: () => Promise.resolve(0),
    onSleepFailed: () => {},
  });

  const held = await task.acquire();

  expect(held.sandbox.id).toBe('imp-a');
  expect(task.imp.getSnapshot().value).toBe('awake');
});

test('it starts the endpoint again on the acquire after a start that failed', async () => {
  const ctx = setupTest();
  const tools = buildStubToolEndpoint({ failedStarts: 1 });

  const task = ctx.start({
    startEndpoint: () => tools.endpoint.startRun(ctx.run),
    readSandbox: () => Promise.resolve(null),
    createSandbox: () => Promise.resolve({ sandbox: buildMockSandbox(), isKept: false }),
    removeSandboxes: () => Promise.resolve(0),
    onSleepFailed: () => {},
  });

  const failed = task.acquire();

  expect(failed).rejects.toThrow('the tool socket could not bind');

  await task.acquire();

  expect(tools.runs).toHaveLength(2);
});

test('it keeps the imp awake and settles the release when the sleep fails', async () => {
  const ctx = setupTest();
  const tools = buildStubToolEndpoint();
  const onSleepFailed = mock(() => {});

  const sandbox = buildMockSandbox({
    suspension: {
      kind: 'memory',
      sleep: () => Promise.reject(new Error('the snapshot would not write')),
      wake: () => Promise.resolve(),
    },
  });

  const task = ctx.start({
    startEndpoint: () => tools.endpoint.startRun(ctx.run),
    readSandbox: () => Promise.resolve(null),
    createSandbox: () => Promise.resolve({ sandbox, isKept: false }),
    removeSandboxes: () => Promise.resolve(0),
    onSleepFailed,
  });

  await task.acquire();
  await task.release();

  expect(task.imp.getSnapshot().value).toBe('awake');
  expect(onSleepFailed).toHaveBeenCalledExactlyOnceWith(new Error('the snapshot would not write'));
});

test('it creates a new imp on the acquire after the held one is gone', async () => {
  const ctx = setupTest();
  const tools = buildStubToolEndpoint();
  const created = [buildMockSandbox({ id: 'imp-a' }), buildMockSandbox({ id: 'imp-b' })];

  const task = ctx.start({
    startEndpoint: () => tools.endpoint.startRun(ctx.run),
    readSandbox: () => Promise.resolve(null),
    createSandbox: () =>
      Promise.resolve({ sandbox: created.shift() ?? buildMockSandbox(), isKept: false }),
    removeSandboxes: () => Promise.resolve(0),
    onSleepFailed: () => {},
  });

  await task.acquire();

  const held = await task.acquire();

  expect(held.sandbox.id).toBe('imp-b');
});

test('it refuses a remove while an acquire is in flight', () => {
  const ctx = setupTest();
  const tools = buildStubToolEndpoint();
  const creating = Promise.withResolvers<{ sandbox: Sandbox; isKept: boolean }>();

  const task = ctx.start({
    startEndpoint: () => tools.endpoint.startRun(ctx.run),
    readSandbox: () => Promise.resolve(null),
    createSandbox: () => creating.promise,
    removeSandboxes: () => Promise.resolve(0),
    onSleepFailed: () => {},
  });

  const acquired = task.acquire();
  const removed = task.remove();

  creating.resolve({ sandbox: buildMockSandbox(), isKept: false });

  expect(removed).rejects.toThrow("the task's imp is busy with another change");
  expect(acquired).resolves.toBeObject();
});

test('it tries a removal again after one that failed', async () => {
  const ctx = setupTest();
  const tools = buildStubToolEndpoint();

  const answers = [
    () => Promise.reject(new Error('the imp would not stop')),
    () => Promise.resolve(1),
  ];

  const task = ctx.start({
    startEndpoint: () => tools.endpoint.startRun(ctx.run),
    readSandbox: () => Promise.resolve(null),
    createSandbox: () => Promise.resolve({ sandbox: buildMockSandbox(), isKept: false }),
    removeSandboxes: () => answers.shift()?.() ?? Promise.resolve(0),
    onSleepFailed: () => {},
  });

  expect(task.remove()).rejects.toThrow('the imp would not stop');

  const removed = await task.remove();

  expect(removed).toBe(1);
  expect(task.imp.getSnapshot().status).toBe('done');
});
