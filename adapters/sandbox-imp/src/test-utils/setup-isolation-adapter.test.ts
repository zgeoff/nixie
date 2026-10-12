import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildMockGrantSpec, buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { setupIsolationAdapter } from './setup-isolation-adapter';
import { startFakeImp } from './start-fake-imp';

test('it adds the model-host secret under the name it is given', async () => {
  const imp = await startFakeImp();

  await setupIsolationAdapter({
    port: imp.port,
    removeSecret: mock(),
    publicEgress: null,
    guestToolPort: imp.guestToolPort,
    secret: 'nixie-test-a',
  });

  expect(imp.calls).toStrictEqual(['secret nixie-test-a api.anthropic.com x-api-key raw']);
});

test('it destroys each imp it made, then removes the secret, when the test finishes', async () => {
  const imp = await startFakeImp();

  // the removal goes on the fake's call log, so the log shows the order of every removal
  const removeSecret = mock((name: string) => {
    imp.calls.push(`secret-remove ${name}`);
    return Promise.resolve();
  });
  const isolation = await setupIsolationAdapter({
    port: imp.port,
    removeSecret,
    publicEgress: null,
    guestToolPort: imp.guestToolPort,
    secret: 'nixie-test-a',
  });
  const sandbox = await isolation.createSandbox(
    buildMockSandboxSpec({
      kind: 'conversation',
      grants: [buildMockGrantSpec({ secret: 'nixie-test-a', host: 'api.anthropic.com' })],
    }),
  );

  onTestFinished(() => {
    expect(imp.calls.slice(-3)).toStrictEqual([
      `forward-stopped ${sandbox.id}`,
      `remove ${sandbox.id}`,
      'secret-remove nixie-test-a',
    ]);
  });
});

test('it destroys an imp whose create was still running when the test finished', async () => {
  const imp = await startFakeImp();
  const isolation = await setupIsolationAdapter({
    port: imp.port,
    removeSecret: mock(),
    publicEgress: null,
    guestToolPort: imp.guestToolPort,
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
    expect(imp.calls).toSatisfyAny((call: string) => call.startsWith('remove '));
  });
});

test('it removes a secret whose add was still running when the test finished', async () => {
  const imp = await startFakeImp();
  const removeSecret = mock(() => Promise.resolve());
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();

  // the add stores the secret only once the test has finished, as one does that outlives a timeout
  onTestFinished(() => {
    release.resolve();
  });
  void setupIsolationAdapter({
    port: {
      ...imp.port,
      addSecret: async (secret) => {
        started.resolve();
        await release.promise;
        await Bun.sleep(50);
        await imp.port.addSecret(secret);
      },
    },
    removeSecret,
    publicEgress: null,
    guestToolPort: imp.guestToolPort,
    secret: 'nixie-test-a',
  });
  await started.promise;

  onTestFinished(() => {
    expect(removeSecret).toHaveBeenCalledWith('nixie-test-a');
  });
});

test('it refuses a secret name impd holds already', async () => {
  const imp = await startFakeImp();

  imp.secrets.set('nixie-test-a', ['api.anthropic.com']);

  expect(
    setupIsolationAdapter({
      port: imp.port,
      removeSecret: mock(),
      publicEgress: null,
      guestToolPort: imp.guestToolPort,
      secret: 'nixie-test-a',
    }),
  ).rejects.toThrow('impd holds a secret named nixie-test-a that this run did not add');
});

test('it never removes a secret it did not add', async () => {
  const imp = await startFakeImp();
  const removeSecret = mock(() => Promise.resolve());

  imp.secrets.set('nixie-test-a', ['api.anthropic.com']);

  const failure = await setupIsolationAdapter({
    port: imp.port,
    removeSecret,
    publicEgress: null,
    guestToolPort: imp.guestToolPort,
    secret: 'nixie-test-a',
  }).catch((error: unknown) => error);

  onTestFinished(() => {
    expect(removeSecret).not.toHaveBeenCalled();
  });

  expect(failure).toBeInstanceOf(Error);
});
