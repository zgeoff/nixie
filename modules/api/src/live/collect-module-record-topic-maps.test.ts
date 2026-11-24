import { expect, onTestFinished, test } from 'bun:test';
import type { LiveTopic } from '@heynixie/contract';
import type { JSONObject, RecordKind } from '@heynixie/log';
import { withWriteTransaction, writeRecords } from '@heynixie/log';
import { buildPromptSeeder } from '@heynixie/prompts/test-utils';
import { startSpendWatcher } from '@heynixie/spend';
import { buildMockGatewayStatus } from '@heynixie/spend/test-utils';
import { createConversationTask, createTask } from '@heynixie/tasks';
import { waitForCondition } from '@heynixie/testing';
import { writeArmedDefinitions } from '@heynixie/triggers';
import { buildTestArmedDefinition } from '@heynixie/triggers/test-utils';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { defaultAPISettings } from '../utils/default-api-settings';

// The tests below make each change that a topic names, and read the changed event of a stream that
// was open before it.
async function setupTest() {
  const api = await startTestAPI(defaultAPISettings, { isSpendOn: true });

  await createConversationTask(api.context);

  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  const stream = await client.live.follow({});

  await stream.next();

  return {
    ...api,
    seed: buildSeeder(api),
    client,
    readChanged: async () => {
      const next = await stream.next();

      await stream.return(undefined);

      return next.value;
    },
  };
}

test.each([
  [
    ['computer', 'tasks'],
    'computer.handover_closed',
    { shortID: 'h1', by: 'assistant', waitedSeconds: 3 },
  ],
  [
    ['definitions'],
    'definition.export_moved',
    { exportID: 'e1', branch: 'edits', to: 'opened', pullRequest: null },
  ],
  [['images'], 'image.pinned', {}],
  [['memory'], 'memory.pin_noticed', { itemID: 'i1', isPinned: true, noticeKey: 'k1' }],
  [['notebook'], 'notebook.note_read', { note: 'n1' }],
  [
    ['tasks', 'triggers', 'definitions'],
    'trigger.fired',
    {
      definitionID: 'water-the-tomatoes',
      definitionHash: 'hash-1',
      source: 'schedule',
      dedupeKey: 'slot-1',
      kind: 'schedule',
      scheduledFor: '2026-11-25T08:00:00.000Z',
      firedAt: '2026-11-25T08:00:01.000Z',
      isCatchUp: false,
      skipped: [],
      skippedCount: 0,
    },
  ],
  [
    ['tasks', 'triggers', 'definitions'],
    'trigger.skipped',
    {
      definitionID: 'water-the-tomatoes',
      source: 'schedule',
      dedupeKey: 'slot-1',
      scheduledFor: ['2026-11-25T08:00:00.000Z'],
      count: 1,
      reason: 'too_late',
      recordedAt: '2026-11-25T08:05:00.000Z',
    },
  ],
  [
    ['triggers', 'definitions'],
    'trigger.deferred',
    { definitionID: 'water-the-tomatoes', slot: '2026-11-25T08:00:00.000Z', until: null },
  ],
] as const satisfies readonly (readonly [readonly LiveTopic[], RecordKind, JSONObject])[])(
  'it sends a changed event with the topics %j when a %s record commits',
  async (topics, kind, payload) => {
    const ctx = await setupTest();

    await writeRecords(ctx.context.log, [
      { kind, definitions: { snapshotHash: 'sha256:test' }, payload },
    ]);

    const changed = await ctx.readChanged();

    expect(changed).toStrictEqual({ kind: 'changed', topics });
  },
);

test('it sends a changed event with the nixie and tasks topics when the owner pauses nixie', async () => {
  const ctx = await setupTest();

  await ctx.client.nixie.pause({ clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60' });

  const changed = await ctx.readChanged();

  expect(changed).toStrictEqual({ kind: 'changed', topics: ['nixie', 'tasks'] });
});

test('it sends a changed event with the tasks topic when the owner sends a message', async () => {
  const ctx = await setupTest();

  await ctx.client.conversation.send({
    clientMessageId: '00000000-0000-4000-8000-000000000001',
    thread: 'conversation',
    text: 'one',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  const changed = await ctx.readChanged();

  expect(changed).toStrictEqual({ kind: 'changed', topics: ['tasks'] });
});

test('it sends a changed event with the approvals topic when a prompt override is proposed', async () => {
  const ctx = await setupTest();

  await buildPromptSeeder({
    log: ctx.context.log,
    clock: ctx.clock,
    definitions: ctx.context.definitions,
  }).promptApproval();

  const changed = await ctx.readChanged();

  expect(changed).toStrictEqual({ kind: 'changed', topics: ['approvals'] });
});

test('it sends a changed event with the triggers and definitions topics when a definition is armed', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, (tx) =>
    writeArmedDefinitions(tx, { log: ctx.context.log, definitions: ctx.context.definitions }, [
      buildTestArmedDefinition(),
    ]),
  );

  const changed = await ctx.readChanged();

  expect(changed).toStrictEqual({ kind: 'changed', topics: ['triggers', 'definitions'] });
});

test('it sends a changed event with the backups topic when a backup fails', async () => {
  const ctx = await setupTest();

  await ctx.seed.failedBackupNotice({ failure: 'data: backup exited 1' });

  const changed = await ctx.readChanged();

  expect(changed).toStrictEqual({ kind: 'changed', topics: ['backups'] });
});

test('it sends a changed event with the spend topic when the gateway stops answering', async () => {
  const ctx = await setupTest();

  const stopping = new AbortController();

  const spend = ctx.context.spend;

  invariant(spend !== undefined, 'the test API holds a spend context when spend is on');

  onTestFinished(() => {
    stopping.abort();
  });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  startSpendWatcher({
    context: spend,
    limits: {
      day: { dollars: 60, tokens: 80_000_000 },
      month: { dollars: 600, tokens: 600_000_000 },
    },
    log: () => {},
    intervalMs: 20,
    signal: stopping.signal,
    isStartUnreachable: false,
  });

  // the first poll set what the next one compares to, so a poll that starts after the first has
  // ended reads the change
  await waitForCondition(() => ctx.spendGateway.readStatus.mock.calls.length >= 2);

  // no stop is written for 30 s of no answer, so only the watcher's own notice tells the stream
  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const changed = await ctx.readChanged();

  expect(changed).toStrictEqual({ kind: 'changed', topics: ['spend'] });
});

test('it sends a changed event with the tasks and definitions topics when a task is created', async () => {
  const ctx = await setupTest();

  await createTask(ctx.context, 'Plan the beds.', 'k3x9m2p7qa');

  const changed = await ctx.readChanged();

  expect(changed).toStrictEqual({
    kind: 'changed',
    topics: ['tasks', 'definitions'],
  });
});
