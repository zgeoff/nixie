import { expect, test } from 'bun:test';
import { buildMockGrantSpec, buildStubSandboxes } from '@heynixie/sandbox/test-utils';
import { createWorkerSandbox } from './create-worker-sandbox';

function setupTest() {
  const sandboxes = buildStubSandboxes();
  const events: string[] = [];
  const modelGrant = buildMockGrantSpec();

  return {
    sandboxes,
    events,
    createWorker: (image: string) =>
      createWorkerSandbox({
        sandboxes: sandboxes.adapter,
        image,
        owner: 'task-garden',
        limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
        modelGrant,
        log: (event) => {
          events.push(event);
        },
      }),
  };
}

test('it keeps the worker sandbox when its image is unchanged', async () => {
  const ctx = setupTest();

  const first = await ctx.createWorker('conversation-old');
  const second = await ctx.createWorker('conversation-old');

  expect(second.isKept).toBe(true);
  expect(second.sandbox.id).toBe(first.sandbox.id);
  expect(ctx.sandboxes.destroyed).toStrictEqual([]);
});

test('it destroys the old worker sandbox and creates a new one when the image changed', async () => {
  const ctx = setupTest();

  const first = await ctx.createWorker('conversation-old');
  const second = await ctx.createWorker('conversation-new');

  expect(second.isKept).toBe(false);
  expect(ctx.sandboxes.destroyed).toStrictEqual([first.sandbox.id]);

  expect(ctx.sandboxes.created.map((spec) => spec.image)).toStrictEqual([
    'conversation-old',
    'conversation-new',
  ]);
});

test('it logs a failed destroy of the old worker sandbox and still creates the new one', async () => {
  const ctx = setupTest();

  await ctx.createWorker('conversation-old');

  ctx.sandboxes.setDestroyError(new Error('the host is gone'));

  const second = await ctx.createWorker('conversation-new');

  expect(ctx.events).toStrictEqual(['sandbox.remove_failed']);
  expect(second.isKept).toBe(false);

  expect(ctx.sandboxes.created.map((spec) => spec.image)).toStrictEqual([
    'conversation-old',
    'conversation-new',
  ]);
});
