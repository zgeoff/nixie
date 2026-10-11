import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { SandboxSpec } from '@heynixie/sandbox';
import type { IsolationSecret, IsolationSuite } from './setup-isolation-suite';
import { setupIsolationSuite } from './setup-isolation-suite';
import type { FakeImp } from './start-fake-imp';
import { startFakeImp } from './start-fake-imp';

const conversationSpec: SandboxSpec = {
  kind: 'conversation',
  image: 'conversation',
  owner: 'isolation-test',
  egress: { kind: 'none' },
  grants: [
    {
      secret: 'model-default',
      host: 'api.anthropic.com',
      env: { ANTHROPIC_API_KEY: 'broker-placeholder' },
    },
  ],
  toolRoute: true,
  limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
};

// a secret whose calls go on the fake impd's call log, so the log shows the order of every removal
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the fake's own call log
function buildLoggedSecret(imp: FakeImp): IsolationSecret {
  return {
    add: () => {
      imp.calls.push('secret-add');
      return Promise.resolve();
    },
    remove: () => {
      imp.calls.push('secret-remove');
      return Promise.resolve();
    },
  };
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the fake's own call log
function setupSuite(imp: FakeImp): Promise<IsolationSuite> {
  return setupIsolationSuite({
    port: imp.port,
    publicEgress: null,
    guestToolPort: imp.guestToolPort,
    secret: buildLoggedSecret(imp),
    conversationSpec,
    toolToken: 'run-token',
  });
}

// the call log with each imp's random name cut away
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the fake's own call log
function formatCalls(imp: FakeImp): readonly string[] {
  return imp.calls.map((call) => call.split(' ')[0] ?? '');
}

describe('a suite set up in beforeAll, as the isolation test sets it up', () => {
  const state: { current: { imp: FakeImp; suite: IsolationSuite } | null } = { current: null };

  beforeAll(async () => {
    const imp = await startFakeImp();

    state.current = { imp, suite: await setupSuite(imp) };
  });
  afterAll(() => state.current?.suite.teardown());

  test('its teardown in a later test removes the imp, then the secret', async () => {
    if (state.current === null) {
      throw new Error('beforeAll set up no suite');
    }
    await state.current.suite.teardown();

    expect(formatCalls(state.current.imp)).toStrictEqual([
      'secret-add',
      'create',
      'grant',
      'forward',
      'forward-stopped',
      'remove',
      'secret-remove',
    ]);
  });
});

test('a teardown whose imp removal fails still removes the secret, then reports the failure', async () => {
  const imp = await startFakeImp();
  const suite = await setupSuite(imp);

  imp.failRemove = true;

  // settled before expect: Bun's rejects matcher blocks on a pending promise, which stalls the query
  const failure = await suite.teardown().catch((error: unknown) => error);

  expect(failure).toMatchObject({ message: '1 of 1 isolation imps failed to destroy' });
  expect(formatCalls(imp).slice(-2)).toStrictEqual(['remove', 'secret-remove']);
});

test('a setup that fails to create the imp removes the secret it added', async () => {
  const imp = await startFakeImp();

  imp.failCreate = true;

  const failure = await setupSuite(imp).catch((error: unknown) => error);

  expect(failure).toMatchObject({ message: 'RAM_BUDGET_EXCEEDED' });
  expect(formatCalls(imp)).toStrictEqual(['secret-add', 'create', 'remove', 'secret-remove']);
});
