import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildMockGrantSpec, buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { makeGatedCall } from '@heynixie/testing';
import { seedSecret } from './seed-secret';
import { setupIsolationAdapter } from './setup-isolation-adapter';
import { startFakeImp } from './start-fake-imp';
import { startSharedImpd } from './start-impd';

async function setupTest() {
  const started = await startSharedImpd();

  return {
    imp: await startFakeImp(started),
    impd: started.impd,
    readCalls: started.readCalls,
    readInputs: started.readInputs,
  };
}

test('it adds the model-host secret under the name it is given', async () => {
  const ctx = await setupTest();

  await setupIsolationAdapter({
    port: ctx.imp.port,
    removeSecret: mock(),
    publicEgress: null,
    guestToolPort: ctx.imp.guestToolPort,
    secret: 'nixie-test-a',
  });

  expect(ctx.readInputs('secrets/add')).toStrictEqual([
    {
      name: 'nixie-test-a',
      kind: 'custom',
      value: 'nixie-isolation-dummy',
      rules: [{ host: 'api.anthropic.com', header: 'x-api-key', scheme: 'raw' }],
    },
  ]);
});

test('it destroys each imp it made, then removes the secret, when the test finishes', async () => {
  const ctx = await setupTest();

  const removeSecret = mock(async (name: string) => {
    await ctx.impd.client.secrets.delete({ name });
  });

  const isolation = await setupIsolationAdapter({
    port: ctx.imp.port,
    removeSecret,
    publicEgress: null,
    guestToolPort: ctx.imp.guestToolPort,
    secret: 'nixie-test-a',
  });

  const sandbox = await isolation.createSandbox(
    buildMockSandboxSpec({
      kind: 'conversation',
      grants: [buildMockGrantSpec({ secret: 'nixie-test-a', host: 'api.anthropic.com' })],
    }),
  );

  onTestFinished(() => {
    expect(
      ctx
        .readCalls()
        .filter((call) => call.procedure !== 'secrets/list')
        .slice(-2)
        .map((call) => [call.procedure, call.input]),
    ).toStrictEqual([
      ['imps/destroy', { name: sandbox.id }],
      ['secrets/delete', { name: 'nixie-test-a' }],
    ]);
  });
});

test('it destroys an imp whose create was still running when the test finished', async () => {
  const ctx = await setupTest();

  const isolation = await setupIsolationAdapter({
    port: ctx.imp.port,
    removeSecret: mock(),
    publicEgress: null,
    guestToolPort: ctx.imp.guestToolPort,
    secret: 'nixie-test-a',
  });

  void isolation.createSandbox(
    buildMockSandboxSpec({
      kind: 'conversation',
      grants: [buildMockGrantSpec({ secret: 'nixie-test-a', host: 'api.anthropic.com' })],
    }),
  );

  onTestFinished(() => {
    expect(ctx.readCalls().map((call) => call.procedure)).toContain('imps/destroy');
  });
});

test('it destroys an imp whose failed create could not roll it back', async () => {
  const ctx = await setupTest();

  ctx.impd.fail('imps/destroy', { code: 'INTERNAL_SERVER_ERROR', status: 500 }, { times: 1 });

  const isolation = await setupIsolationAdapter({
    port: {
      ...ctx.imp.port,
      addGrant: () => Promise.reject(new Error('NOT_FOUND')),
    },
    removeSecret: mock(),
    publicEgress: null,
    guestToolPort: ctx.imp.guestToolPort,
    secret: 'nixie-test-a',
  });

  const created = isolation.createSandbox(
    buildMockSandboxSpec({
      kind: 'conversation',
      grants: [buildMockGrantSpec({ secret: 'nixie-test-a', host: 'api.anthropic.com' })],
    }),
  );

  await created.catch(() => {});

  onTestFinished(() => {
    const name = ctx.readInputs('imps/create').at(0)?.['name'];

    expect(ctx.readInputs('imps/destroy')).toStrictEqual([{ name }, { name }]);
  });

  expect(created).rejects.toThrow('INTERNAL_SERVER_ERROR');
});

test('it removes a secret whose add was still running when the test finished', async () => {
  const ctx = await setupTest();

  const removeSecret = mock(() => Promise.resolve());
  const addSecret = makeGatedCall(ctx.imp.port.addSecret, { delayMs: 50 });

  onTestFinished(() => {
    addSecret.release();
  });

  void setupIsolationAdapter({
    port: { ...ctx.imp.port, addSecret: addSecret.call },
    removeSecret,
    publicEgress: null,
    guestToolPort: ctx.imp.guestToolPort,
    secret: 'nixie-test-a',
  });

  await addSecret.started;

  onTestFinished(() => {
    expect(removeSecret).toHaveBeenCalledWith('nixie-test-a');
  });
});

test('it refuses a secret name impd holds already', async () => {
  const ctx = await setupTest();

  await seedSecret(ctx.impd, 'nixie-test-a', ['api.anthropic.com']);

  expect(
    setupIsolationAdapter({
      port: ctx.imp.port,
      removeSecret: mock(),
      publicEgress: null,
      guestToolPort: ctx.imp.guestToolPort,
      secret: 'nixie-test-a',
    }),
  ).rejects.toThrow('impd holds a secret named nixie-test-a that this run did not add');
});

test('it never removes a secret it did not add', async () => {
  const ctx = await setupTest();

  const removeSecret = mock(() => Promise.resolve());

  await seedSecret(ctx.impd, 'nixie-test-a', ['api.anthropic.com']);

  const failure = await setupIsolationAdapter({
    port: ctx.imp.port,
    removeSecret,
    publicEgress: null,
    guestToolPort: ctx.imp.guestToolPort,
    secret: 'nixie-test-a',
  }).catch((error: unknown) => error);

  onTestFinished(() => {
    expect(removeSecret).not.toHaveBeenCalled();
  });

  expect(failure).toBeInstanceOf(Error);
});

test('it reads a sandbox it made through the adapter', async () => {
  const ctx = await setupTest();

  const isolation = await setupIsolationAdapter({
    port: ctx.imp.port,
    removeSecret: mock(),
    publicEgress: null,
    guestToolPort: ctx.imp.guestToolPort,
    secret: 'nixie-test-a',
  });

  const sandbox = await isolation.createSandbox(buildMockSandboxSpec({ grants: [] }));
  const found = await isolation.readSandbox(sandbox.id);

  expect(found?.id).toBe(sandbox.id);
});

test('it lists the sandboxes it made for an owner through the adapter', async () => {
  const ctx = await setupTest();

  const isolation = await setupIsolationAdapter({
    port: ctx.imp.port,
    removeSecret: mock(),
    publicEgress: null,
    guestToolPort: ctx.imp.guestToolPort,
    secret: 'nixie-test-a',
  });

  const sandbox = await isolation.createSandbox(buildMockSandboxSpec({ grants: [] }));
  const listed = await isolation.listSandboxes(sandbox.spec.owner);

  expect(listed.map((held) => held.id)).toStrictEqual([sandbox.id]);
});

test('it reads the sandbox records the adapter wrote', async () => {
  const ctx = await setupTest();

  const isolation = await setupIsolationAdapter({
    port: ctx.imp.port,
    removeSecret: mock(),
    publicEgress: null,
    guestToolPort: ctx.imp.guestToolPort,
    secret: 'nixie-test-a',
  });

  const sandbox = await isolation.createSandbox(buildMockSandboxSpec({ grants: [] }));
  const records = await isolation.readSandboxRecords();

  expect(records).toIncludeAllPartialMembers([
    { kind: 'sandbox.created', payload: expect.objectContaining({ sandboxID: sandbox.id }) },
  ]);
});
