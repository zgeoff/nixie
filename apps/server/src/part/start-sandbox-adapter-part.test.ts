import { expect, onTestFinished, test } from 'bun:test';
import type { LogFields } from '@heynixie/logger';
import { buildSandboxRecorder } from '@heynixie/sandbox';
import {
  buildMockSandboxSpec,
  buildStubGuestSandboxes,
  writeMemoryKills,
} from '@heynixie/sandbox/test-utils';
import { createPlanLoginsHolder } from '@heynixie/spend';
import { buildStubSpendGateway } from '@heynixie/spend/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { startTestServer } from '../test-utils/start-test-server';
import { startSandboxAdapterPart } from './start-sandbox-adapter-part';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  // onTestFinished runs its callbacks first in, first out, so a sandbox on the stack is destroyed
  // while the server's writer still runs.
  onTestFinished(() => stack.disposeAsync());

  const server = await startTestServer();

  const events: string[] = [];
  const killLines: { readonly kills: unknown }[] = [];

  const log = (event: string, fields?: LogFields): void => {
    events.push(event);

    if (event === 'sandbox.memory_kill') {
      killLines.push({ kills: fields?.['kills'] });
    }
  };

  return { stack, ...server, events, killLines, log };
}

test('it applies the watcher to the adapter it builds, so a rising count gives one line', async () => {
  const ctx = await setupTest();

  const adapter = startSandboxAdapterPart({
    sandbox: { adapter: 'test' },
    spend: null,
    dataDir: ctx.dataDir,
    hostHeldNames: [],
    log: ctx.log,
    recorder: { log: ctx.context.log, definitions: ctx.context.definitions },
    toolTarget: ctx.endpoint.getToolTarget,
  });

  const sandbox = await adapter.create(buildMockSandboxSpec());

  ctx.stack.defer(() => sandbox.destroy());

  await writeMemoryKills(sandbox, 1);

  const stream = await sandbox.spawn({ argv: ['sh', '-c', 'exit 0'], maxMessageBytes: 1024 });

  await stream.exit;
  await waitForCondition(() => ctx.killLines.length === 1);

  expect(ctx.killLines).toStrictEqual([{ kills: 1 }]);
  expect(ctx.events.filter((event) => event === 'sandbox.memory_watch')).toHaveLength(1);
});

test('it applies the watcher to the adapter passed in as createSandboxAdapter, so a rising count gives one line', async () => {
  const ctx = await setupTest();

  const recorder = buildSandboxRecorder({
    log: ctx.context.log,
    definitions: ctx.context.definitions,
  });

  const guests = buildStubGuestSandboxes({ recorder, countTokens: () => 0 });

  const adapter = startSandboxAdapterPart({
    createSandboxAdapter: () => guests.adapter,
    sandbox: { adapter: 'test' },
    spend: null,
    dataDir: ctx.dataDir,
    hostHeldNames: [],
    log: ctx.log,
    recorder: { log: ctx.context.log, definitions: ctx.context.definitions },
    toolTarget: ctx.endpoint.getToolTarget,
  });

  const sandbox = await adapter.create(buildMockSandboxSpec({ kind: 'checker' }));

  ctx.stack.defer(() => sandbox.destroy());

  await writeMemoryKills(sandbox, 1);

  const stream = await sandbox.spawn({ argv: ['check'], maxMessageBytes: 1024 });

  await stream.stop();

  await waitForCondition(() => ctx.killLines.length === 1);

  expect(ctx.killLines).toStrictEqual([{ kills: 1 }]);
  expect(ctx.events.filter((event) => event === 'sandbox.memory_watch')).toHaveLength(1);
});

test('it registers the sandbox it creates at the gateway when spendStop is set', async () => {
  const ctx = await setupTest();

  const gateway = buildStubSpendGateway();

  const counted = startSandboxAdapterPart({
    sandbox: { adapter: 'test' },
    spend: {
      control: 'http://127.0.0.1:8790',
      modelURL: 'http://127.0.0.1:8789',
      gateway,
      planLogins: createPlanLoginsHolder(),
    },
    dataDir: ctx.dataDir,
    hostHeldNames: [],
    log: ctx.log,
    recorder: { log: ctx.context.log, definitions: ctx.context.definitions },
    toolTarget: ctx.endpoint.getToolTarget,
  });

  const sandbox = await counted.create(buildMockSandboxSpec({ kind: 'conversation' }));

  ctx.stack.defer(() => sandbox.destroy());

  expect(gateway.putSandbox.mock.calls).toStrictEqual([[sandbox.id, null]]);
});
