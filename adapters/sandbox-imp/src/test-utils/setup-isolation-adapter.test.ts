import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildMockGrantSpec, buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { makeGatedCall } from '@heynixie/testing';
import { setupIsolationAdapter } from './setup-isolation-adapter';
import { startFakeImp } from './start-fake-imp';

// the fake impd that each test's adapter talks to
async function setupTest() {
  return { imp: await startFakeImp() };
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

  expect(ctx.imp.calls).toStrictEqual(['secret nixie-test-a api.anthropic.com x-api-key raw']);
});

test('it destroys each imp it made, then removes the secret, when the test finishes', async () => {
  const ctx = await setupTest();

  // the removal goes on the fake's call log, so the log shows the order of every removal
  const removeSecret = mock((name: string) => {
    ctx.imp.calls.push(`secret-remove ${name}`);

    return Promise.resolve();
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
    expect(ctx.imp.calls.slice(-3)).toStrictEqual([
      `forward-stopped ${sandbox.id}`,
      `remove ${sandbox.id}`,
      'secret-remove nixie-test-a',
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

  // the test ends before the create returns, as one does when the create outlives its timeout
  void isolation.createSandbox(
    buildMockSandboxSpec({
      kind: 'conversation',
      grants: [buildMockGrantSpec({ secret: 'nixie-test-a', host: 'api.anthropic.com' })],
    }),
  );

  onTestFinished(() => {
    expect(ctx.imp.calls).toSatisfyAny((call: string) => call.startsWith('remove '));
  });
});

test('it destroys an imp whose failed create could not roll it back', async () => {
  const ctx = await setupTest();

  // the rollback's removal fails, and the removal at teardown succeeds
  ctx.imp.failRemove = true;

  onTestFinished(() => {
    ctx.imp.failRemove = false;
  });

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
    const name = ctx.imp.created.at(0)?.name;

    expect(ctx.imp.calls.filter((call) => call.startsWith('remove '))).toStrictEqual([
      `remove ${name}`,
      `remove ${name}`,
    ]);
  });

  expect(created).rejects.toThrow('INTERNAL_SERVER_ERROR');
});

test('it removes a secret whose add was still running when the test finished', async () => {
  const ctx = await setupTest();

  const removeSecret = mock(() => Promise.resolve());

  // the add stores the secret only 50 ms after the test has finished, as one that outlives a
  // timeout does
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

  ctx.imp.secrets.set('nixie-test-a', ['api.anthropic.com']);

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

  ctx.imp.secrets.set('nixie-test-a', ['api.anthropic.com']);

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
