import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { actionsProjection } from '@heynixie/actions';
import { logProjections, startWriter } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { tasksProjections } from '@heynixie/tasks';
import { buildTestClock } from '@heynixie/testing';
import { buildActions } from './build-actions';

async function setupTest() {
  const dataDir = await mkdtemp(`${tmpdir()}/nixie-actions-`);
  const writer = await startWriter({ dataDir });

  onTestFinished(async () => {
    await writer.stop();

    await rm(dataDir, { recursive: true, force: true });
  });

  const context: TasksContext = {
    log: {
      writer,
      deploymentKey: await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
        'wrapKey',
        'unwrapKey',
      ]),
      projections: [...logProjections, ...tasksProjections, actionsProjection],
    },
    clock: buildTestClock(1_000_000),
    definitions: () => ({ snapshotHash: 'sha256:test' }),
  };

  return { context };
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
