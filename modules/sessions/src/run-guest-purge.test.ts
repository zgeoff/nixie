import { expect, test } from 'bun:test';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { runGuestPurge } from './run-guest-purge';
import { buildStubSandboxes } from './test-utils/build-stub-sandboxes';

function setupTest() {
  return { sandboxes: buildStubSandboxes() };
}

test('it completes once the guest reports its session state gone', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.sandboxes.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation' }),
  );

  await runGuestPurge({ sandbox, command: { argv: ['guest'], env: {} } });

  expect(ctx.sandboxes.purged).toStrictEqual([sandbox.id]);
});

test('it fails with the guest failure when the guest exits without removing its session state', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.sandboxes.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation' }),
  );

  ctx.sandboxes.setPurgeAnswer([
    { type: 'failed', reason: 'error', detail: 'the session state is still on disk' },
  ]);

  expect(runGuestPurge({ sandbox, command: { argv: ['guest'], env: {} } })).rejects.toThrow(
    'the conversation guest did not remove its session state: the session state is still on disk',
  );
});
