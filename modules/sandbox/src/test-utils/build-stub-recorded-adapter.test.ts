import { expect, test } from 'bun:test';
import { buildMockSandboxSpec } from './build-mock-sandbox-spec';
import { buildStubRecordedAdapter } from './build-stub-recorded-adapter';
import { setupTestRecorder } from './setup-test-recorder';

function setupTest() {
  return setupTestRecorder();
}

test('it lists the sandboxes the recorder holds for its adapter and the owner', async () => {
  const ctx = await setupTest();

  const adapter = buildStubRecordedAdapter(ctx.recorder, 'imp');

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
      adapter: 'process',
      spec: buildMockSandboxSpec({ owner: 'task-1:step-2' }),
    },
    {
      event: 'created',
      sandboxID: 'nixie-c',
      adapter: 'imp',
      spec: buildMockSandboxSpec({ owner: 'task-9:step-1' }),
    },
  ]);

  const sandboxes = await adapter.list('task-1:step-2');

  expect(sandboxes.map((sandbox) => sandbox.id)).toStrictEqual(['nixie-a']);
});

test('it notes the ID of each sandbox it destroys', async () => {
  const ctx = await setupTest();

  const adapter = buildStubRecordedAdapter(ctx.recorder, 'imp');

  await ctx.writeEvents([
    {
      event: 'created',
      sandboxID: 'nixie-a',
      adapter: 'imp',
      spec: buildMockSandboxSpec({ owner: 'task-1:step-2' }),
    },
  ]);

  const [sandbox] = await adapter.list('task-1:step-2');

  await sandbox?.destroy();

  expect(adapter.destroyed).toStrictEqual(['nixie-a']);
});
