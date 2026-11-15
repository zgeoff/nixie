import { expect, test } from 'bun:test';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { buildStubSandboxAdapter } from '../test-utils/build-stub-sandbox-adapter';
import { CodeSandboxDestroyError, destroyCodeRunSandboxes } from './destroy-code-run-sandboxes';

test('it destroys every sandbox of the calls, and leaves the sandboxes of other calls', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0));

  const kept = await adapter.create(
    buildMockSandboxSpec({ kind: 'code_run', toolRoute: false, owner: 'code_run:call-3' }),
  );

  const first = await adapter.create(
    buildMockSandboxSpec({ kind: 'code_run', toolRoute: false, owner: 'code_run:call-1' }),
  );

  const second = await adapter.create(
    buildMockSandboxSpec({ kind: 'code_run', toolRoute: false, owner: 'code_run:call-2' }),
  );

  await destroyCodeRunSandboxes(adapter, ['call-1', 'call-2']);

  const stillThere = await adapter.read(kept.id);

  expect(adapter.destroyed).toStrictEqual([first.id, second.id]);
  expect(stillThere).not.toBeNull();
});

test('it fails with the forget message when a destroy fails', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0), {
    destroyFailures: [{ kind: 'reject', message: 'impd is down' }],
  });

  await adapter.create(
    buildMockSandboxSpec({ kind: 'code_run', toolRoute: false, owner: 'code_run:call-1' }),
  );

  const destroying = destroyCodeRunSandboxes(adapter, ['call-1']);

  const [outcome] = await Promise.allSettled([destroying]);

  expect(outcome).toMatchObject({
    status: 'rejected',
    reason: expect.objectContaining({
      message: 'nixie could not destroy a code sandbox that holds this text. Try the forget again.',
    }),
  });
});

test('it fails the same way when the list of a call fails', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0), {
    listFailures: [{ kind: 'reject', message: 'impd is down' }],
  });

  const [outcome] = await Promise.allSettled([destroyCodeRunSandboxes(adapter, ['call-1'])]);

  expect(outcome).toMatchObject({
    status: 'rejected',
    reason: expect.any(CodeSandboxDestroyError),
  });
});
