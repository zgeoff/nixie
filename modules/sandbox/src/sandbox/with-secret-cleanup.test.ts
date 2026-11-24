import { expect, test } from 'bun:test';
import { buildMockSandboxSpec, buildStubSandboxes, setupTestRecorder } from '../test-utils';
import { withSecretCleanup } from './with-secret-cleanup';

async function setupTest() {
  const recorded = await setupTestRecorder();

  const stub = buildStubSandboxes();

  return {
    stub,
    adapter: withSecretCleanup(stub.adapter, {
      log: recorded.log,
      logger: () => {},
      hostHeldNames: [],
    }),
    writeEvents: recorded.writeEvents,
  };
}

test('it removes a secret that no sandbox holds once a destroy ends', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    { event: 'grant_started', secret: 'nixie-model-old', host: 'api.example.test' },
  ]);

  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  await sandbox.destroy();

  expect(ctx.stub.removedSecrets).toStrictEqual(['nixie-model-old']);
});

test('it keeps a secret that a grant added until a sandbox holds it', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    { event: 'grant_started', secret: 'nixie-model-new', host: 'api.example.test' },
  ]);

  await ctx.adapter.addSecret({
    name: 'nixie-model-new',
    value: null,
    host: 'api.example.test',
    header: 'bearer',
  });

  const other = await ctx.adapter.create(buildMockSandboxSpec());

  await other.destroy();

  expect(ctx.stub.removedSecrets).not.toContain('nixie-model-new');
});

test('it removes a secret that a later destroy leaves unheld after its sandbox existed', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    { event: 'grant_started', secret: 'nixie-model-new', host: 'api.example.test' },
  ]);

  await ctx.adapter.addSecret({
    name: 'nixie-model-new',
    value: null,
    host: 'api.example.test',
    header: 'bearer',
  });

  const holder = await ctx.adapter.create(
    buildMockSandboxSpec({
      grants: [{ secret: 'nixie-model-new', host: 'api.example.test', env: {} }],
    }),
  );

  await ctx.writeEvents([
    {
      event: 'created',
      sandboxID: holder.id,
      adapter: ctx.stub.adapter.id,
      spec: holder.spec,
    },
    { event: 'destroyed', sandboxID: holder.id, reason: 'destroyed' },
  ]);

  await holder.destroy();

  expect(ctx.stub.removedSecrets).toStrictEqual(['nixie-model-new']);
});
