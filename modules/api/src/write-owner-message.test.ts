import { expect, test } from 'bun:test';
import { readRecords, removeRecordKey } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';
import { writeOwnerMessage } from './write-owner-message';

async function setupTest() {
  const api = await startTestAPI();
  const db = api.writer.db.$extendTables<
    APITables & {
      records: { kind: string; payload: string; key_id: string | null; sealed: Uint8Array | null };
    }
  >();

  return { ...api, db };
}

test('it writes your message into the conversation inbox', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const result = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'hello PASTED',
    spans: [
      { start: 0, end: 6, source: 'typed' },
      { start: 6, end: 12, source: 'pasted' },
    ],
  });

  invariant(result.status === 'written');
  const task = await ctx.db
    .$extendTables<{ tasks: { state: string; last_inbox_sequence: number } }>()
    .selectFrom('tasks')
    .select(['state', 'last_inbox_sequence'])
    .executeTakeFirstOrThrow();

  expect(task).toStrictEqual({
    state: 'ready',
    last_inbox_sequence: result.sequence,
  });
});

test('it writes a message once for the same client message ID', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const input = {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'hello',
    spans: [{ start: 0, end: 5, source: 'typed' as const }],
  };
  const first = await writeOwnerMessage(ctx.context, laptop.caller, input);
  const retry = await writeOwnerMessage(ctx.context, laptop.caller, input);

  invariant(first.status === 'written');
  const messages = await ctx.db
    .selectFrom('records')
    .select('kind')
    .where('kind', '=', 'owner_message')
    .execute();

  expect(retry).toStrictEqual({
    status: 'written',
    duplicate: true,
    sequence: first.sequence,
  });
  expect(messages).toHaveLength(1);
});

test('it refuses the same client message ID with a different text', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'hello',
    spans: [{ start: 0, end: 5, source: 'typed' }],
  });

  const result = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'goodbye',
    spans: [{ start: 0, end: 7, source: 'typed' }],
  });

  expect(result).toStrictEqual({ status: 'reused' });
});

test('it answers a retry of a forgotten message by its thread alone', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const input = {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'hello',
    spans: [{ start: 0, end: 5, source: 'typed' as const }],
  };
  const first = await writeOwnerMessage(ctx.context, laptop.caller, input);

  invariant(first.status === 'written');
  const record = await ctx.db
    .selectFrom('records')
    .select('key_id')
    .where('kind', '=', 'owner_message')
    .executeTakeFirstOrThrow();

  invariant(typeof record.key_id === 'string');
  await removeRecordKey(ctx.context.log, record.key_id);

  const result = await writeOwnerMessage(ctx.context, laptop.caller, input);

  expect(result).toStrictEqual({
    status: 'written',
    duplicate: true,
    sequence: first.sequence,
  });
});

test('it refuses a message to a thread no task has', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const result = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'task-404',
    text: 'hello',
    spans: [{ start: 0, end: 5, source: 'typed' }],
  });

  expect(result).toStrictEqual({ status: 'thread_not_found' });
});

test('it refuses a message to a task that is done', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  await ctx.db
    .$extendTables<{ tasks: { state: string } }>()
    .updateTable('tasks')
    .set({ state: 'done' })
    .execute();

  const result = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'hello',
    spans: [{ start: 0, end: 5, source: 'typed' }],
  });

  expect(result).toStrictEqual({ status: 'thread_not_found' });
});

test('it encrypts the spans with the text and keeps neither in plain text', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'a distinctive phrase',
    spans: [
      { start: 0, end: 2, source: 'typed' },
      { start: 2, end: 20, source: 'pasted' },
    ],
  });

  const record = await ctx.db
    .selectFrom('records')
    .select(['payload', 'key_id'])
    .where('kind', '=', 'owner_message')
    .executeTakeFirstOrThrow();
  const [entry] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    thread: 'conversation',
  }).then((entries) => entries.filter((candidate) => candidate.record.kind === 'owner_message'));
  const database = await Bun.file(`${ctx.dataDir}/nixie.db-wal`).text();

  expect(JSON.parse(record.payload)).toStrictEqual({
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    identityID: laptop.caller.identityID,
    spans: 'as_sent',
  });
  expect(entry?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: {
      text: 'a distinctive phrase',
      spans: [
        { start: 0, end: 2, source: 'typed' },
        { start: 2, end: 20, source: 'pasted' },
      ],
    },
  });
  expect(database).not.toInclude('a distinctive phrase');
  expect(database).not.toInclude('pasted');
});

test('it labels the whole message unknown when its spans leave a gap', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'hello PASTED',
    spans: [
      { start: 0, end: 5, source: 'typed' },
      { start: 6, end: 12, source: 'pasted' },
    ],
  });

  const entries = await readRecords(ctx.context.log, { afterSequence: 0, thread: 'conversation' });
  const message = entries.find((entry) => entry.record.kind === 'owner_message')?.record;

  expect(message?.payload['spans']).toBe('unknown');
  expect(message?.erasable).toStrictEqual({
    status: 'readable',
    fields: { text: 'hello PASTED', spans: [{ start: 0, end: 12, source: 'unknown' }] },
  });
});

test('it refuses a caller whose session was revoked after the call resolved it', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  await ctx.db
    .updateTable('identities')
    .set({ revoked_at: 1_000_000 })
    .where('identity_id', '=', laptop.caller.identityID)
    .execute();

  const result = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'hello',
    spans: [{ start: 0, end: 5, source: 'typed' }],
  });

  expect(result).toStrictEqual({ status: 'unauthorized' });
});

test('it refuses a client message ID that another device used for the same text', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const phone = await createDeviceSession(ctx.context, 'phone');
  const input = {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'hello',
    spans: [{ start: 0, end: 5, source: 'typed' as const }],
  };

  await writeOwnerMessage(ctx.context, laptop.caller, input);

  const result = await writeOwnerMessage(ctx.context, phone.caller, input);

  expect(result).toStrictEqual({ status: 'reused' });
});

test('it keeps the sending device time zone in the message payload', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const result = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'Landed in Lisbon.',
    spans: [{ start: 0, end: 17, source: 'typed' }],
    timeZone: 'Europe/Lisbon',
  });

  invariant(result.status === 'written');
  const [entry] = await readRecords(ctx.context.log, {
    afterSequence: result.sequence - 1,
    limit: 1,
  });

  expect(entry?.record.payload['timeZone']).toBe('Europe/Lisbon');
});

test('it writes a message with a time zone the server does not know, and leaves the zone out', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const result = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'Landed.',
    spans: [{ start: 0, end: 7, source: 'typed' }],
    timeZone: 'Atlantis/Poseidonia',
  });

  invariant(result.status === 'written');
  const [entry] = await readRecords(ctx.context.log, {
    afterSequence: result.sequence - 1,
    limit: 1,
  });

  expect(entry?.record.kind).toBe('owner_message');
  expect(entry?.record.payload).not.toContainKey('timeZone');
});
