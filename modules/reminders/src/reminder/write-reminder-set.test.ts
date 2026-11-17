import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { readTestTriggerRows } from '@heynixie/triggers/test-utils';
import { startTestReminders } from '../test-utils';
import { readArmedReminders } from './read-armed-reminders';
import { readReminderVersion } from './read-reminder-version';
import { writeReminderCancel } from './write-reminder-cancel';
import { writeReminderSet } from './write-reminder-set';

async function setupTest() {
  const ctx = await startTestReminders();

  return {
    ...ctx,
    setReminder: () =>
      withWriteTransaction(ctx.writer, (tx) =>
        writeReminderSet(tx, ctx.reminders, {
          name: 'Tomatoes',
          note: 'Water the tomatoes.',
          trigger: { at: '2027-03-10T08:00:00Z' },
          origin: 'conversation',
        }),
      ),
  };
}

test('it arms the trigger of a reminder in the transaction that sets it', async () => {
  const ctx = await setupTest();
  const written = await ctx.setReminder();
  const rows = await readTestTriggerRows(ctx);

  expect(rows.definitions).toMatchObject([
    {
      definition_id: `reminder:${written.reminderID}`,
      source_id: 'schedule',
      target: 'conversation',
      trigger: '{"at":"2027-03-10T08:00:00Z"}',
    },
  ]);
});

test('it stores the version under the hash its trigger row names', async () => {
  const ctx = await setupTest();

  await ctx.setReminder();

  const rows = await readTestTriggerRows(ctx);

  const hash = rows.definitions[0]?.definition_hash ?? '';

  const version = await readReminderVersion(ctx.writer.db, hash);

  expect(version).toStrictEqual({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { at: '2027-03-10T08:00:00Z' },
  });
});

test('it hands the arming hook each active reminder, and none after a cancel', async () => {
  const ctx = await setupTest();
  const written = await ctx.setReminder();
  const active = await withWriteTransaction(ctx.writer, (tx) => readArmedReminders(tx));

  await withWriteTransaction(ctx.writer, (tx) => writeReminderCancel(tx, ctx.reminders, written));

  const cancelled = await withWriteTransaction(ctx.writer, (tx) => readArmedReminders(tx));

  expect(active).toStrictEqual([
    {
      definitionID: `reminder:${written.reminderID}`,
      definitionHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      source: 'schedule',
      target: 'conversation',
      trigger: { at: '2027-03-10T08:00:00Z' },
    },
  ]);

  expect(cancelled).toStrictEqual([]);
});

test('it withdraws the trigger of a cancelled reminder', async () => {
  const ctx = await setupTest();
  const written = await ctx.setReminder();

  await withWriteTransaction(ctx.writer, (tx) => writeReminderCancel(tx, ctx.reminders, written));

  const rows = await readTestTriggerRows(ctx);

  expect(rows.definitions[0]?.definition_hash).toBeNull();
});
