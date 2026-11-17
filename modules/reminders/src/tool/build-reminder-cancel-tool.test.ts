import { expect, test } from 'bun:test';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { readReminderList } from '../reminder/read-reminder-list';
import { buildReminderToolCall, startTestReminders } from '../test-utils';
import { buildReminderCancelTool } from './build-reminder-cancel-tool';
import { buildReminderSetTool } from './build-reminder-set-tool';

async function setupTest() {
  const ctx = await startTestReminders();

  const set = buildReminderSetTool(ctx.reminders);
  const cancel = buildReminderCancelTool(ctx.reminders);

  return {
    ...ctx,
    runSet: (input: object) =>
      set.run(buildReminderToolCall('reminder.set', input), buildMockToolContext()),
    runCancel: (input: object) =>
      cancel.run(buildReminderToolCall('reminder.cancel', input), buildMockToolContext()),
    readListed: () =>
      readReminderList(ctx.writer.db, { now: ctx.clock.now(), readZone: ctx.reminders.readZone }),
  };
}

test('#reminder.cancel cancels a reminder, and refuses a second cancel', async () => {
  const ctx = await setupTest();

  const set = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { at: '2027-03-10T08:00:00Z' },
  });

  const reminder = set.status === 'ok' ? (set.result['reminder'] ?? null) : null;

  const first = await ctx.runCancel({ reminder });
  const second = await ctx.runCancel({ reminder });
  const listed = await ctx.readListed();

  expect(first).toStrictEqual({ status: 'ok', result: { reminder } });
  expect(second).toMatchObject({ status: 'ok', result: { refused: { code: 'NOT_ACTIVE' } } });
  expect(listed).toStrictEqual([]);
});
