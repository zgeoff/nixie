import { expect, mock, test } from 'bun:test';
import type { Logger } from '@heynixie/logger';
import { buildWorkerRunOwner } from '@heynixie/sandbox';
import { buildMockSandboxSpec, buildStubSandboxes } from '@heynixie/sandbox/test-utils';
import { buildStubSpendGateway } from '../test-utils';
import { SandboxCountsUnreachableError } from './sandbox-counts-unreachable-error';
import { withSandboxCounts } from './with-sandbox-counts';

function setupTest() {
  const sandboxes = buildStubSandboxes();
  const gateway = buildStubSpendGateway();
  const log = mock<Logger>(() => {});

  return {
    sandboxes,
    gateway,
    log,
    adapter: withSandboxCounts(sandboxes.adapter, { gateway, log }),
  };
}

test.each(['conversation', 'checker', 'worker'] as const)(
  'it registers a %s sandbox as count only before it returns',
  async (kind) => {
    const ctx = setupTest();

    const sandbox = await ctx.adapter.create(buildMockSandboxSpec({ kind, owner: 'task-1' }));

    expect(ctx.gateway.putSandbox.mock.calls).toStrictEqual([[sandbox.id, null]]);
  },
);

test('it leaves a worker run sandbox to its run', async () => {
  const ctx = setupTest();

  await ctx.adapter.create(
    buildMockSandboxSpec({ kind: 'worker', owner: buildWorkerRunOwner('r1') }),
  );

  expect(ctx.gateway.putSandbox.mock.calls).toStrictEqual([]);
});

test('it registers no sandbox that holds no model grant', async () => {
  const ctx = setupTest();

  await ctx.adapter.create(buildMockSandboxSpec({ kind: 'fetch', owner: 'task-1' }));

  expect(ctx.gateway.putSandbox.mock.calls).toStrictEqual([]);
});

test('it destroys a new sandbox and fails the create when the gateway refuses the registration', async () => {
  const ctx = setupTest();

  ctx.gateway.putSandbox.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const created = ctx.adapter.create(buildMockSandboxSpec({ kind: 'conversation', owner: 'c' }));

  expect(created).rejects.toThrow(/did not register the sandbox/u);

  await created.catch(() => {});

  expect(ctx.sandboxes.destroyed).toHaveLength(1);
});

test('it removes the count when the sandbox is destroyed', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation', owner: 'c' }),
  );

  await sandbox.destroy();

  expect(ctx.gateway.removeSandbox.mock.calls).toStrictEqual([[sandbox.id]]);
});

test('it keeps the count of a sandbox whose destroy fails', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation', owner: 'c' }),
  );

  ctx.sandboxes.setDestroyError(new Error('impd did not answer'));

  await sandbox.destroy().catch(() => {});

  expect(ctx.gateway.removeSandbox.mock.calls).toStrictEqual([]);
});

test('it logs a failed removal and still destroys the sandbox', async () => {
  const ctx = setupTest();

  ctx.gateway.removeSandbox.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const sandbox = await ctx.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation', owner: 'c' }),
  );

  await sandbox.destroy();

  expect(ctx.log.mock.calls).toStrictEqual([
    ['spend.sandbox_remove_failed', { sandboxID: sandbox.id, reason: 'no answer' }, 'warn'],
  ]);

  expect(ctx.sandboxes.destroyed).toStrictEqual([sandbox.id]);
});

test('it registers a kept sandbox that a list returns once', async () => {
  const ctx = setupTest();

  ctx.gateway.readSandbox.mockResolvedValue({ kind: 'not_found' });

  const first = await ctx.sandboxes.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation', owner: 'c' }),
  );

  await ctx.adapter.list('c');
  await ctx.adapter.list('c');

  expect(ctx.gateway.putSandbox.mock.calls).toStrictEqual([[first.id, null]]);
});

test('it patches the limit of a kept sandbox that the gateway holds, and puts none', async () => {
  const ctx = setupTest();

  const kept = await ctx.sandboxes.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation', owner: 'c' }),
  );

  await ctx.adapter.read(kept.id);
  await ctx.adapter.list('c');

  expect(ctx.gateway.patchSandbox.mock.calls).toStrictEqual([[kept.id, null]]);
  expect(ctx.gateway.putSandbox.mock.calls).toStrictEqual([]);
});

test('it fails the read of a kept sandbox when the gateway does not answer', async () => {
  const ctx = setupTest();

  const kept = await ctx.sandboxes.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation', owner: 'c' }),
  );

  ctx.gateway.readSandbox.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  expect(ctx.adapter.read(kept.id)).rejects.toBeInstanceOf(SandboxCountsUnreachableError);
});
