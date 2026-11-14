import { expect, mock, test } from 'bun:test';
import { startTestActions } from '@heynixie/actions/test-utils';
import { buildActions } from './build-actions';

async function setupTest() {
  const actions = await startTestActions();

  return { context: actions.context };
}

test('it gives the test send tool a connector when the test build names a provider', async () => {
  const ctx = await setupTest();

  const actions = buildActions(ctx.context, {
    log: mock(() => {}),
    testProviderURL: 'http://127.0.0.1:9',
  });

  expect([...actions.connectors.keys()]).toStrictEqual([
    actions.logConnector.tool.name,
    'test.send',
  ]);
});

test('it gives only the log tool a connector when no provider is named', async () => {
  const ctx = await setupTest();

  const actions = buildActions(ctx.context, { log: mock(() => {}), testProviderURL: null });

  expect([...actions.connectors.keys()]).toStrictEqual([actions.logConnector.tool.name]);
});
