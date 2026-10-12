import { expect, test } from 'bun:test';
import { removeStaleSandboxes } from './remove-stale-sandboxes';
import { buildMockSandboxSpec } from './test-utils/build-mock-sandbox-spec';
import { buildStubRecordedAdapter } from './test-utils/build-stub-recorded-adapter';
import { setupTestRecorder } from './test-utils/setup-test-recorder';

async function setupTest() {
  const recorder = await setupTestRecorder();
  const adapter = buildStubRecordedAdapter(recorder.recorder, 'imp');

  return { log: recorder.log, writeEvents: recorder.writeEvents, adapter };
}

test('it destroys every sandbox of the adapter whose owner is not kept', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    {
      event: 'created',
      sandboxID: 'nixie-a',
      adapter: 'imp',
      spec: buildMockSandboxSpec({ owner: 'task-1:step-2' }),
    },
    {
      event: 'created',
      sandboxID: 'nixie-b',
      adapter: 'imp',
      spec: buildMockSandboxSpec({ owner: 'task-1:step-2' }),
    },
    {
      event: 'created',
      sandboxID: 'nixie-c',
      adapter: 'imp',
      spec: buildMockSandboxSpec({ owner: 'web_fetch' }),
    },
  ]);

  await removeStaleSandboxes({ log: ctx.log, adapter: ctx.adapter, keptOwners: ['conversation'] });

  expect(ctx.adapter.destroyed).toIncludeSameMembers(['nixie-a', 'nixie-b', 'nixie-c']);
});

test('it never destroys a kept owner’s sandbox or another adapter’s', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    {
      event: 'created',
      sandboxID: 'nixie-a',
      adapter: 'imp',
      spec: buildMockSandboxSpec({ owner: 'conversation' }),
    },
    {
      event: 'created',
      sandboxID: 'nixie-b',
      adapter: 'process',
      spec: buildMockSandboxSpec({ owner: 'task-1:step-2' }),
    },
  ]);

  await removeStaleSandboxes({ log: ctx.log, adapter: ctx.adapter, keptOwners: ['conversation'] });

  expect(ctx.adapter.destroyed).toStrictEqual([]);
});
