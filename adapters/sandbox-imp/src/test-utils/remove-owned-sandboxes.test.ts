import { expect, test } from 'bun:test';
import { buildMockSandboxSpec, setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { buildImpSandboxAdapter } from '../sandbox/build-imp-sandbox-adapter';
import { removeOwnedSandboxes } from './remove-owned-sandboxes';
import { startFakeImp } from './start-fake-imp';
import { startSharedImpd } from './start-impd';

async function setupTest() {
  const started = await startSharedImpd();
  const recorder = await setupTestRecorder();
  const imp = await startFakeImp(started);

  const adapter = buildImpSandboxAdapter({
    port: imp.port,
    recorder: recorder.recorder,
    config: { publicEgress: null },
    toolTarget: () => ({ path: '/nonexistent/tools.sock' }),
    guestToolPort: imp.guestToolPort,
  });

  return { imp, adapter, impd: started.impd, readInputs: started.readInputs };
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

  expect(ctx.readInputs('imps/destroy').map((input) => input['name'])).toStrictEqual([
    first.id,
    second.id,
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
  expect(ctx.readInputs('imps/destroy').map((input) => input['name'])).toStrictEqual([]);
});

test('it tries every destroy, then rejects with each failure', async () => {
  const ctx = await setupTest();

  const first = await ctx.adapter.create(
    buildMockSandboxSpec({ owner: 'conversation:step-7', toolRoute: false }),
  );

  const second = await ctx.adapter.create(
    buildMockSandboxSpec({ owner: 'conversation:step-7', toolRoute: false }),
  );

  ctx.impd.fail('imps/destroy', { code: 'INTERNAL_SERVER_ERROR', status: 500 });

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

  expect(ctx.readInputs('imps/destroy').map((input) => input['name'])).toStrictEqual([
    first.id,
    second.id,
  ]);
});
