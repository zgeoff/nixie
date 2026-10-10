import { expect, test } from 'bun:test';
import { buildSandboxRecorder } from './build-sandbox-recorder';
import { setupTestRecorder } from './test-utils/setup-test-recorder';
import type { SandboxEvent, SandboxSpec } from './types';

const spec: SandboxSpec = {
  kind: 'worker',
  image: 'worker',
  owner: 'task-1:step-2',
  egress: { kind: 'none' },
  grants: [
    { secret: 'model', host: 'api.anthropic.com', env: { ANTHROPIC_API_KEY: 'placeholder' } },
  ],
  toolRoute: true,
  limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
};

test('it writes one record per lifecycle event, with the definitions in force', async () => {
  const ctx = await setupTestRecorder();

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
  expect(records.every((record) => record.definitions.snapshotHash === 'sha256:test')).toBeTrue();
});

const history: readonly SandboxEvent[] = [
  { event: 'created', sandboxID: 'nixie-a', adapter: 'imp', spec },
  { event: 'created', sandboxID: 'nixie-b', adapter: 'imp', spec },
  { event: 'created', sandboxID: 'nixie-c', adapter: 'imp', spec },
  {
    event: 'created',
    sandboxID: 'nixie-d',
    adapter: 'imp',
    spec: { ...spec, owner: 'task-9:step-1' },
  },
  { event: 'created', sandboxID: 'nixie-e', adapter: 'process', spec },
  { event: 'slept', sandboxID: 'nixie-b' },
  { event: 'destroyed', sandboxID: 'nixie-c', reason: 'create_failed' },
];

test('it lists every sandbox of an owner and adapter that is not destroyed, with its state', async () => {
  const ctx = await setupTestRecorder();

  await ctx.writeEvents(history);

  const rows = await ctx.recorder.list('imp', 'task-1:step-2');

  expect(rows).toStrictEqual([
    { sandboxID: 'nixie-a', adapter: 'imp', owner: 'task-1:step-2', state: 'awake', spec },
    { sandboxID: 'nixie-b', adapter: 'imp', owner: 'task-1:step-2', state: 'sleeping', spec },
  ]);
});

test.each([
  ['imp', 'nixie-c', null],
  ['process', 'nixie-a', null],
  ['process', 'nixie-e', 'nixie-e'],
] as const)(
  'it finds sandbox %s/%s only through its adapter while it stands',
  async (adapter, id, found) => {
    const ctx = await setupTestRecorder();

    await ctx.writeEvents(history);

    const row = await ctx.recorder.findRow(adapter, id);

    expect(row?.sandboxID ?? null).toBe(found);
  },
);

test('it refuses a log without the sandboxes projection', async () => {
  const ctx = await setupTestRecorder();

  expect(() =>
    buildSandboxRecorder({
      log: { ...ctx.log, projections: [] },
      definitions: () => ({ snapshotHash: 'sha256:test' }),
    }),
  ).toThrow('the log passed to the sandbox recorder lacks the sandboxes projection');
});
