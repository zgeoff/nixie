import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { buildReminderTriggerID } from '@heynixie/triggers';
import { writeReminderCancel } from '../reminder/write-reminder-cancel';
import { writeReminderSet } from '../reminder/write-reminder-set';
import { writeReminderUpdate } from '../reminder/write-reminder-update';
import { startTestReminders } from '../test-utils';
import type { RemindersTables } from '../types';

async function setupTest() {
  const ctx = await startTestReminders();

  return {
    ...ctx,
    setReminder: (
      trigger: Parameters<typeof writeReminderSet>[2]['trigger'],
      note = 'Water the tomatoes.',
    ) =>
      withWriteTransaction(ctx.writer, (tx) =>
        writeReminderSet(tx, ctx.reminders, {
          name: 'Tomatoes',
          note,
          trigger,
          origin: 'conversation',
        }),
      ),
    readRows: () =>
      ctx.writer.db.$extendTables<RemindersTables>().selectFrom('reminders').selectAll().execute(),
  };
}

test('it folds a set into an active reminder that holds its version hash and trigger', async () => {
  const ctx = await setupTest();

  const written = await ctx.setReminder({
    schedule: { every: 'day', at: '08:00', zone: 'UTC', catchUp: 'once' },
  });

  const rows = await ctx.readRows();

  expect(rows).toStrictEqual([
    {
      reminder_id: written.reminderID,
      short_id: written.shortID,
      reminder_hash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      trigger: '{"schedule":{"at":"08:00","catchUp":"once","every":"day","zone":"UTC"}}',
      state: 'active',
      origin: 'conversation',
      set_sequence: expect.any(Number),
      fired_at: null,
      recent_fires: '[]',
      updated_sequence: expect.any(Number),
    },
  ]);
});

test('it keeps the newest 3 fires of a recurring reminder and leaves it active', async () => {
  const ctx = await setupTest();

  const written = await ctx.setReminder({
    schedule: { every: 'day', at: '08:00', zone: 'UTC', catchUp: 'once' },
  });

  const [row] = await ctx.readRows();

  for (const day of ['10', '11', '12', '13']) {
    await ctx.fire({
      triggerID: buildReminderTriggerID(written.reminderID),
      hash: row?.reminder_hash ?? '',
      kind: 'schedule',
      scheduledFor: `2027-03-${day}T08:00:00.000Z`,
    });
  }

  const [after] = await ctx.readRows();

  expect(after).toMatchObject({ state: 'active', fired_at: null });
  expect(JSON.parse(after?.recent_fires ?? '[]')).toHaveLength(3);
});

test('it marks a one-off fired when its trigger fires', async () => {
  const ctx = await setupTest();
  const written = await ctx.setReminder({ at: '2027-03-10T08:00:00Z' });
  const [row] = await ctx.readRows();

  await ctx.fire({
    triggerID: buildReminderTriggerID(written.reminderID),
    hash: row?.reminder_hash ?? '',
    kind: 'at',
    scheduledFor: '2027-03-10T08:00:00.000Z',
  });

  const [after] = await ctx.readRows();

  expect(after).toMatchObject({ state: 'fired', fired_at: expect.any(Number) });
});

test('it takes the new hash and trigger of an update', async () => {
  const ctx = await setupTest();

  const written = await ctx.setReminder({
    schedule: { every: 'day', at: '08:00', zone: 'UTC', catchUp: 'once' },
  });

  const [before] = await ctx.readRows();

  await withWriteTransaction(ctx.writer, (tx) =>
    writeReminderUpdate(tx, ctx.reminders, {
      ...written,
      name: 'Tomatoes',
      note: 'Water the tomatoes well.',
      trigger: { schedule: { every: 'day', at: '08:00', zone: 'UTC', catchUp: 'once' } },
    }),
  );

  const [after] = await ctx.readRows();

  expect(after?.reminder_hash).not.toBe(before?.reminder_hash);
  expect(after?.state).toBe('active');
});

test('it marks a cancelled reminder cancelled', async () => {
  const ctx = await setupTest();

  const written = await ctx.setReminder({
    schedule: { every: 'day', at: '08:00', zone: 'UTC', catchUp: 'once' },
  });

  await withWriteTransaction(ctx.writer, (tx) => writeReminderCancel(tx, ctx.reminders, written));

  const [row] = await ctx.readRows();

  expect(row?.state).toBe('cancelled');
});
