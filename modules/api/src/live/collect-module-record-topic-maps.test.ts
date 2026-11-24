import { expect, test } from 'bun:test';
import type { LiveTopic } from '@heynixie/contract';
import type { JSONObject, RecordKind } from '@heynixie/log';
import { markChanged, publishChanged, withWriteTransaction, writeRecords } from '@heynixie/log';
import { createConversationTask, createTask } from '@heynixie/tasks';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

// The tests below make each change that a topic names, and read the changed event of a stream that
// was open before it.
async function setupTest() {
  const api = await startTestAPI();

  await createConversationTask(api.context);

  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  const stream = await client.live.follow({});

  await stream.next();

  return {
    ...api,
    client,
    readChanged: async () => {
      const next = await stream.next();

      await stream.return(undefined);

      return next.value;
    },
  };
}

test.each([
  [['approvals'], 'prompts.override_proposed', {}],
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
  [['triggers'], 'trigger.armed', { armed: [], withdrawn: [] }],
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

test('it sends a changed event with the backups topic when a write with no record marks it', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, (tx) => {
    markChanged(tx, ['backups']);

    return Promise.resolve();
  });

  const changed = await ctx.readChanged();

  expect(changed).toStrictEqual({ kind: 'changed', topics: ['backups'] });
});

test('it sends a changed event with the spend topic when a change that no write made is published', async () => {
  const ctx = await setupTest();

  publishChanged(ctx.writer, ['spend']);

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
