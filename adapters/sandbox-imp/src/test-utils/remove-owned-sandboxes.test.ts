import { expect, test } from 'bun:test';
import { buildMockSandboxSpec, setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { buildImpSandboxAdapter } from '../build-imp-sandbox-adapter';
import { removeOwnedSandboxes } from './remove-owned-sandboxes';
import { startFakeImp } from './start-fake-imp';

async function setupTest() {
  const recorder = await setupTestRecorder();
  const imp = await startFakeImp();

  const adapter = buildImpSandboxAdapter({
    port: imp.port,
    recorder: recorder.recorder,
    config: { publicEgress: null },
    toolTarget: () => ({ path: '/nonexistent/tools.sock' }),
    guestToolPort: imp.guestToolPort,
  });

  return { imp, adapter };
}

test('it destroys every sandbox of each owner it is given', async () => {
  const ctx = await setupTest();

  const first = await ctx.adapter.create(
    buildMockSandboxSpec({ owner: 'conversation:step-7', toolRoute: false }),
  );

  const second = await ctx.adapter.create(
    buildMockSandboxSpec({ owner: 'code_run:step-8', toolRoute: false }),
  );

  await removeOwnedSandboxes(ctx.adapter, ['conversation:step-7', 'code_run:step-8']);

  expect(ctx.imp.calls.filter((call) => call.startsWith('remove '))).toStrictEqual([
    `remove ${first.id}`,
    `remove ${second.id}`,
  ]);
});

test('it never removes a sandbox of another owner', async () => {
  const ctx = await setupTest();

  const other = await ctx.adapter.create(
    buildMockSandboxSpec({ owner: 'code_run:step-8', toolRoute: false }),
  );

  await removeOwnedSandboxes(ctx.adapter, ['conversation:step-7']);

  const left = await ctx.adapter.list('code_run:step-8');

  expect(left).toMatchObject([{ id: other.id }]);
  expect(ctx.imp.calls).not.toContain(`remove ${other.id}`);
});

test('it tries every destroy, then rejects with each failure', async () => {
  const ctx = await setupTest();

  const first = await ctx.adapter.create(
    buildMockSandboxSpec({ owner: 'conversation:step-7', toolRoute: false }),
  );

  const second = await ctx.adapter.create(
    buildMockSandboxSpec({ owner: 'conversation:step-7', toolRoute: false }),
  );

  ctx.imp.failRemove = true;

  const failure = await removeOwnedSandboxes(ctx.adapter, ['conversation:step-7']).catch(
    (error: unknown) => error,
  );

  expect(failure).toBeInstanceOf(AggregateError);

  expect(failure).toMatchObject({
    message: '2 isolation imps failed to destroy',
    errors: [
      expect.objectContaining({ message: 'INTERNAL_SERVER_ERROR' }),
      expect.objectContaining({ message: 'INTERNAL_SERVER_ERROR' }),
    ],
  });

  expect(ctx.imp.calls.filter((call) => call.startsWith('remove '))).toStrictEqual([
    `remove ${first.id}`,
    `remove ${second.id}`,
  ]);
});
