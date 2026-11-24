import { expect, mock, test } from 'bun:test';
import { buildMockSandboxSpec, buildStubSandboxes, setupTestRecorder } from '../test-utils';
import { removeUnheldSecrets } from './remove-unheld-secrets';

async function setupTest() {
  const recorded = await setupTestRecorder();

  const stub = buildStubSandboxes();
  const logger = mock<(event: string) => void>();

  await recorded.writeEvents([
    { event: 'grant_started', secret: 'nixie-model-old', host: 'api.example.test' },
    { event: 'grant_started', secret: 'nixie-model-live', host: 'api.example.test' },
    { event: 'grant_started', secret: 'nixie-model-host', host: 'api.example.test' },
    { event: 'grant_started', secret: 'nixie-model-failed', host: 'api.example.test' },
    {
      event: 'created',
      sandboxID: 'nixie-a',
      adapter: stub.adapter.id,
      spec: buildMockSandboxSpec({
        grants: [{ secret: 'nixie-model-live', host: 'api.example.test', env: {} }],
      }),
    },
    {
      event: 'granted',
      sandboxID: 'nixie-a',
      secret: 'nixie-model-live',
      host: 'api.example.test',
    },
    {
      event: 'granted',
      sandboxID: 'nixie-gone',
      secret: 'nixie-model-reference-only',
      host: 'api.example.test',
      reference: 'deployment:kagi',
    },
    {
      event: 'granted',
      sandboxID: 'nixie-gone',
      secret: 'nixie-model-host-held-profile-removed',
      host: 'api.example.test',
    },
  ]);

  return {
    stub,
    logger,
    options: {
      log: recorded.log,
      logger,
      adapter: stub.adapter,
      hostHeldNames: ['nixie-model-host'],
    },
  };
}

test('it removes the names nixie added that no live sandbox holds, a granted record with a reference included', async () => {
  const ctx = await setupTest();
  const removed = await removeUnheldSecrets(ctx.options);

  expect(removed).toStrictEqual([
    'nixie-model-old',
    'nixie-model-failed',
    'nixie-model-reference-only',
  ]);

  expect(ctx.stub.removedSecrets).toStrictEqual(removed);
});

test('it keeps the name a live sandbox holds and the name of a host-held profile', async () => {
  const ctx = await setupTest();

  await removeUnheldSecrets(ctx.options);

  expect(
    ctx.stub.removedSecrets.filter((name) =>
      ['nixie-model-live', 'nixie-model-host'].includes(name),
    ),
  ).toStrictEqual([]);
});

test('it keeps a name that only a granted record without a reference names', async () => {
  const ctx = await setupTest();

  await removeUnheldSecrets(ctx.options);

  expect(ctx.stub.removedSecrets).not.toContain('nixie-model-host-held-profile-removed');
});

test('it never removes a name the records do not hold', async () => {
  const ctx = await setupTest();

  await removeUnheldSecrets(ctx.options);

  expect(ctx.stub.removedSecrets).not.toContain('secret-an-operator-added');
});

test('it logs a name whose removal failed and goes on with the rest', async () => {
  const ctx = await setupTest();

  const removeSecret = (name: string): Promise<void> =>
    name === 'nixie-model-old'
      ? Promise.reject(new Error('the broker refused'))
      : ctx.stub.adapter.removeSecret(name);

  const removed = await removeUnheldSecrets({
    ...ctx.options,
    adapter: { id: ctx.stub.adapter.id, removeSecret },
  });

  expect(removed).toStrictEqual(['nixie-model-failed', 'nixie-model-reference-only']);

  expect(ctx.logger).toHaveBeenCalledWith(
    'sandbox.secret_remove_failed',
    { secret: 'nixie-model-old', reason: 'the broker refused' },
    'warn',
  );
});
