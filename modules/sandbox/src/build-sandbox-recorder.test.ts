import { expect, test } from 'bun:test';
import { buildSandboxRecorder } from './build-sandbox-recorder';
import { buildMockGrantSpec } from './test-utils/build-mock-grant-spec';
import { buildMockSandboxSpec } from './test-utils/build-mock-sandbox-spec';
import { setupTestRecorder } from './test-utils/setup-test-recorder';

function setupTest() {
  return setupTestRecorder();
}

test('it writes one record per lifecycle event', async () => {
  const ctx = await setupTest();

  const spec = buildMockSandboxSpec({ grants: [buildMockGrantSpec()] });

  await ctx.writeEvents([
    { event: 'created', sandboxID: 'nixie-a', adapter: 'imp', spec },
    { event: 'granted', sandboxID: 'nixie-a', secret: 'model', host: 'api.anthropic.com' },
    { event: 'slept', sandboxID: 'nixie-a' },
    { event: 'woken', sandboxID: 'nixie-a' },
    { event: 'destroyed', sandboxID: 'nixie-a', reason: 'destroyed' },
  ]);

  const records = await ctx.readSandboxRecords();

  expect(records.map((record): unknown => [record.kind, record.payload])).toStrictEqual([
    ['sandbox.created', { sandboxID: 'nixie-a', adapter: 'imp', spec }],
    ['sandbox.granted', { sandboxID: 'nixie-a', secret: 'model', host: 'api.anthropic.com' }],
    ['sandbox.slept', { sandboxID: 'nixie-a' }],
    ['sandbox.woken', { sandboxID: 'nixie-a' }],
    ['sandbox.destroyed', { sandboxID: 'nixie-a', reason: 'destroyed' }],
  ]);
});

test('it writes each record with the definitions in force', async () => {
  const ctx = await setupTest();

  const recorder = buildSandboxRecorder({
    log: ctx.log,
    definitions: () => ({ snapshotHash: 'sha256:in-force' }),
  });

  await recorder.write({ event: 'slept', sandboxID: 'nixie-a' });
  await recorder.write({ event: 'woken', sandboxID: 'nixie-a' });

  const records = await ctx.readSandboxRecords();

  expect(records.map((record) => record.definitions.snapshotHash)).toStrictEqual([
    'sha256:in-force',
    'sha256:in-force',
  ]);
});

test('it lists every sandbox of an owner and adapter that is not destroyed, with its state', async () => {
  const ctx = await setupTest();

  const spec = buildMockSandboxSpec({ owner: 'task-1:step-2' });

  await ctx.writeEvents([
    { event: 'created', sandboxID: 'nixie-a', adapter: 'imp', spec },
    { event: 'created', sandboxID: 'nixie-b', adapter: 'imp', spec },
    { event: 'created', sandboxID: 'nixie-c', adapter: 'imp', spec },
    {
      event: 'created',
      sandboxID: 'nixie-d',
      adapter: 'imp',
      spec: buildMockSandboxSpec({ owner: 'task-9:step-1' }),
    },
    { event: 'created', sandboxID: 'nixie-e', adapter: 'process', spec },
    { event: 'slept', sandboxID: 'nixie-b' },
    { event: 'destroyed', sandboxID: 'nixie-c', reason: 'create_failed' },
  ]);

  const rows = await ctx.recorder.list('imp', 'task-1:step-2');

  expect(rows).toStrictEqual([
    { sandboxID: 'nixie-a', adapter: 'imp', owner: 'task-1:step-2', state: 'awake', spec },
    { sandboxID: 'nixie-b', adapter: 'imp', owner: 'task-1:step-2', state: 'sleeping', spec },
  ]);
});

test('it finds a sandbox through its own adapter', async () => {
  const ctx = await setupTest();

  const spec = buildMockSandboxSpec({ owner: 'task-1:step-2' });

  await ctx.writeEvents([{ event: 'created', sandboxID: 'nixie-e', adapter: 'process', spec }]);

  const row = await ctx.recorder.findRow('process', 'nixie-e');

  expect(row).toStrictEqual({
    sandboxID: 'nixie-e',
    adapter: 'process',
    owner: 'task-1:step-2',
    state: 'awake',
    spec,
  });
});

test('it finds no sandbox through another adapter', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    { event: 'created', sandboxID: 'nixie-a', adapter: 'imp', spec: buildMockSandboxSpec() },
  ]);

  const row = await ctx.recorder.findRow('process', 'nixie-a');

  expect(row).toBeNull();
});

test('it finds no sandbox once it is destroyed', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    { event: 'created', sandboxID: 'nixie-c', adapter: 'imp', spec: buildMockSandboxSpec() },
    { event: 'destroyed', sandboxID: 'nixie-c', reason: 'create_failed' },
  ]);

  const row = await ctx.recorder.findRow('imp', 'nixie-c');

  expect(row).toBeNull();
});

test('it refuses a log without the sandboxes projection', async () => {
  const ctx = await setupTest();

  expect(() =>
    buildSandboxRecorder({
      log: { ...ctx.log, projections: [] },
      definitions: () => ({ snapshotHash: 'sha256:test' }),
    }),
  ).toThrow('the log passed to the sandbox recorder lacks the sandboxes projection');
});
