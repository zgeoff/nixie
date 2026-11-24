import { expect, test } from 'bun:test';
import { buildMockSandboxSpec, buildStubSandboxes, setupTestRecorder } from '../test-utils';
import { withSecretCleanup } from './with-secret-cleanup';

async function setupTest() {
  const recorded = await setupTestRecorder();

  const stub = buildStubSandboxes();
  const options = { log: recorded.log, logger: () => {}, hostHeldNames: [] };

  return {
    stub,
    options,
    adapter: withSecretCleanup(stub.adapter, options),
    writeEvents: recorded.writeEvents,
  };
}

test('it removes a secret of an earlier run that no sandbox holds once a destroy ends', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    { event: 'grant_started', secret: 'nixie-model-old', host: 'api.example.test' },
  ]);

  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  await sandbox.destroy();

  expect(ctx.stub.removedSecrets).toStrictEqual(['nixie-model-old']);
});

test('it keeps a secret that a grant added before any sandbox holds it', async () => {
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

  expect(ctx.stub.removedSecrets).toStrictEqual([]);
});

test('it keeps a secret that a runner cached after the last sandbox using it is destroyed', async () => {
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

  await holder.destroy();

  expect(ctx.stub.removedSecrets).toStrictEqual([]);
});

test('it keeps the secret of a grant whose sandbox create failed', async () => {
  const ctx = await setupTest();

  const failing = withSecretCleanup(
    { ...ctx.stub.adapter, create: () => Promise.reject(new Error('no capacity')) },
    ctx.options,
  );

  await ctx.writeEvents([
    { event: 'grant_started', secret: 'nixie-model-new', host: 'api.example.test' },
  ]);

  await failing.addSecret({
    name: 'nixie-model-new',
    value: null,
    host: 'api.example.test',
    header: 'bearer',
  });

  const created = failing.create(buildMockSandboxSpec());

  await Promise.allSettled([created]);
  await failing.removeSecret('nixie-model-new');

  expect(ctx.stub.removedSecrets).toStrictEqual([]);
});

test('it keeps the secret of a second grant when the first sandbox create succeeds', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    { event: 'grant_started', secret: 'nixie-model-second', host: 'api.example.test' },
  ]);

  await ctx.adapter.addSecret({
    name: 'nixie-model-new',
    value: null,
    host: 'api.example.test',
    header: 'bearer',
  });

  await ctx.adapter.addSecret({
    name: 'nixie-model-second',
    value: null,
    host: 'api.example.test',
    header: 'bearer',
  });

  const first = await ctx.adapter.create(
    buildMockSandboxSpec({
      grants: [{ secret: 'nixie-model-new', host: 'api.example.test', env: {} }],
    }),
  );

  await first.destroy();

  expect(ctx.stub.removedSecrets).toStrictEqual([]);
});

test('it adds a secret only after a removal in flight ends', async () => {
  const ctx = await setupTest();

  const gate = Promise.withResolvers<void>();

  const adapter = withSecretCleanup(
    {
      ...ctx.stub.adapter,
      removeSecret: async (name) => {
        await gate.promise;

        await ctx.stub.adapter.removeSecret(name);
      },
    },
    ctx.options,
  );

  const removing = adapter.removeSecret('nixie-model-new');

  const adding = adapter.addSecret({
    name: 'nixie-model-new',
    value: null,
    host: 'api.example.test',
    header: 'bearer',
  });

  await Promise.resolve();

  const addedBeforeRemovalEnded = ctx.stub.secrets.length;

  gate.resolve();

  await Promise.all([removing, adding]);

  expect({
    addedBeforeRemovalEnded,
    removed: ctx.stub.removedSecrets,
    added: ctx.stub.secrets.length,
  }).toStrictEqual({ addedBeforeRemovalEnded: 0, removed: ['nixie-model-new'], added: 1 });
});

test('it refuses to remove a name this process added', async () => {
  const ctx = await setupTest();

  await ctx.adapter.addSecret({
    name: 'nixie-model-new',
    value: null,
    host: 'api.example.test',
    header: 'bearer',
  });

  await ctx.adapter.removeSecret('nixie-model-new');

  expect(ctx.stub.removedSecrets).toStrictEqual([]);
});
