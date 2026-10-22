import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';
import { updateSessionLabel } from './update-session-label';
import { writeOwnerMessage } from './write-owner-message';
import { writeSessionRevocation } from './write-session-revocation';

function setupTest() {
  return startTestAPI();
}

test('it puts a renamed label on the next message, and leaves the message before it as it was', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const browser = await createDeviceSession(ctx.context, 'Browser');

  await writeOwnerMessage(ctx.context, browser.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'Before.',
    spans: [],
  });

  await updateSessionLabel(ctx.context, { sessionID: browser.sessionID, label: 'phone' });

  await writeOwnerMessage(ctx.context, browser.caller, {
    clientMessageId: '1c8e7a2f-5b3d-4e6a-8f9c-2d4b6a8c0e12',
    thread: 'conversation',
    text: 'After.',
    spans: [],
  });

  const messages = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['owner_message'],
  });

  expect(messages.map((entry) => entry.record.erasable)).toStrictEqual([
    {
      status: 'readable',
      fields: {
        text: 'Before.',
        spans: [{ start: 0, end: 7, source: 'unknown' }],
        sessionLabel: 'Browser',
      },
    },
    {
      status: 'readable',
      fields: {
        text: 'After.',
        spans: [{ start: 0, end: 6, source: 'unknown' }],
        sessionLabel: 'phone',
      },
    },
  ]);
});

test('it records the change with the label encrypted, and keeps the label on the session’s row', async () => {
  const ctx = await setupTest();
  const browser = await createDeviceSession(ctx.context, 'Browser');

  const result = await updateSessionLabel(ctx.context, {
    sessionID: browser.sessionID,
    label: 'phone',
  });

  const [records, row] = await Promise.all([
    readRecords(ctx.context.log, { afterSequence: 0, kinds: ['session.labelled'] }),
    ctx.writer.db
      .$extendTables<APITables>()
      .selectFrom('identities')
      .select('label')
      .where('identity_id', '=', browser.sessionID)
      .executeTakeFirstOrThrow(),
  ]);

  expect(result).toStrictEqual({
    status: 'labelled',
    sessionID: browser.sessionID,
    label: 'phone',
  });

  expect(records.map((entry) => [entry.record.payload, entry.record.erasable])).toStrictEqual([
    [{ identityID: browser.sessionID }, { status: 'readable', fields: { label: 'phone' } }],
  ]);

  expect(row.label).toBe('phone');
});

test('it puts a label that holds line breaks on one line', async () => {
  const ctx = await setupTest();
  const browser = await createDeviceSession(ctx.context, 'Browser');

  const result = await updateSessionLabel(ctx.context, {
    sessionID: browser.sessionID,
    label: '  work\n PC ',
  });

  expect(result).toStrictEqual({
    status: 'labelled',
    sessionID: browser.sessionID,
    label: 'work PC',
  });
});

test.each([
  ['white space alone', ' \n '],
  ['more than 100 characters', 'x'.repeat(101)],
])('it refuses a label of %s and keeps the label before it', async (_case, label) => {
  const ctx = await setupTest();
  const browser = await createDeviceSession(ctx.context, 'Browser');
  const result = await updateSessionLabel(ctx.context, { sessionID: browser.sessionID, label });

  const row = await ctx.writer.db
    .$extendTables<APITables>()
    .selectFrom('identities')
    .select('label')
    .where('identity_id', '=', browser.sessionID)
    .executeTakeFirstOrThrow();

  expect(result).toStrictEqual({ status: 'invalid_label' });
  expect(row.label).toBe('Browser');
});

test('it answers not found for a revoked session', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const phone = await createDeviceSession(ctx.context, 'phone');

  await writeSessionRevocation(ctx.context, laptop.caller, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: phone.sessionID,
  });

  const result = await updateSessionLabel(ctx.context, {
    sessionID: phone.sessionID,
    label: 'old phone',
  });

  expect(result).toStrictEqual({ status: 'not_found' });
});

test('it answers not found for an ID that no session has', async () => {
  const ctx = await setupTest();

  const result = await updateSessionLabel(ctx.context, {
    sessionID: '7d2c4e6a-8b0f-4a1c-9e3d-5f7a9b1c3d5e',
    label: 'phone',
  });

  expect(result).toStrictEqual({ status: 'not_found' });
});
