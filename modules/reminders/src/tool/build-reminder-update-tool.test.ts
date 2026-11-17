import { expect, test } from 'bun:test';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { readTestTriggerRows } from '@heynixie/triggers/test-utils';
import { readReminderList } from '../reminder/read-reminder-list';
import { buildReminderToolCall, startTestReminders } from '../test-utils';
import { buildReminderSetTool } from './build-reminder-set-tool';
import { buildReminderUpdateTool } from './build-reminder-update-tool';

async function setupTest() {
  const ctx = await startTestReminders();

  const set = buildReminderSetTool(ctx.reminders);
  const update = buildReminderUpdateTool(ctx.reminders);

  return {
    ...ctx,
    runSet: (input: object) =>
      set.run(buildReminderToolCall('reminder.set', input), buildMockToolContext()),
    runUpdate: (input: object) =>
      update.run(buildReminderToolCall('reminder.update', input), buildMockToolContext()),
    readListed: () =>
      readReminderList(ctx.writer.db, { now: ctx.clock.now(), readZone: ctx.reminders.readZone }),
    readTrigger: async () => {
      const rows = await readTestTriggerRows(ctx);

      return rows.definitions[0];
    },
  };
}

test('#reminder.update changes the note and keeps the schedule', async () => {
  const ctx = await setupTest();

  const set = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { at: '2027-03-10T08:00:00Z' },
  });

  const reminder = set.status === 'ok' ? (set.result['reminder'] ?? null) : null;

  const outcome = await ctx.runUpdate({ reminder, note: 'Water them well.' });
  const listed = await ctx.readListed();

  expect(outcome).toMatchObject({ status: 'ok', result: { reminder } });

  expect(listed.map((entry) => [entry.note, entry.rendered])).toStrictEqual([
    ['Water them well.', 'once on Wed 10 Mar at 08:00'],
  ]);
});

test('#reminder.update refuses an unknown ID', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.runUpdate({ reminder: 'nope', note: 'x' });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      refused: {
        code: 'UNKNOWN_REMINDER',
        sentence: 'No reminder has the ID nope. Call reminders.list to see the IDs.',
      },
    },
  });
});

test('#reminder.update refuses a one-off that already fired', async () => {
  const ctx = await setupTest();

  const set = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { at: '2027-03-10T08:00:00Z' },
  });

  const reminder = set.status === 'ok' ? (set.result['reminder'] ?? null) : null;

  const trigger = await ctx.readTrigger();

  await ctx.fire({
    triggerID: trigger?.definition_id ?? '',
    hash: trigger?.definition_hash ?? '',
    kind: 'at',
    scheduledFor: '2027-03-10T08:00:00.000Z',
  });

  const outcome = await ctx.runUpdate({ reminder, note: 'Later.' });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { refused: { code: 'NOT_ACTIVE' } },
  });
});
