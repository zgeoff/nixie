import { expect, test } from 'bun:test';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { readReminderList } from '../reminder/read-reminder-list';
import { buildReminderToolCall, startTestReminders } from '../test-utils';
import { buildReminderSetTool } from './build-reminder-set-tool';

async function setupTest() {
  const ctx = await startTestReminders();

  const set = buildReminderSetTool(ctx.reminders);

  return {
    ...ctx,
    runSet: (input: object) =>
      set.run(buildReminderToolCall('reminder.set', input), buildMockToolContext()),
    readListed: () =>
      readReminderList(ctx.writer.db, { now: ctx.clock.now(), readZone: ctx.reminders.readZone }),
  };
}

test('#reminder.set sets a one-off with its ID, its words and its next fire', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { at: '2027-03-10T08:00:00Z' },
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      reminder: expect.stringMatching(/^[0-9a-z]{10}$/u),
      rendered: 'once on Wed 10 Mar at 08:00',
      next: '2027-03-10T08:00:00.000Z',
    },
  });
});

test('#reminder.set sets a recurring reminder with the zone owner by default', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { schedule: { every: 'week', on: 'fri', at: '08:00' } },
  });

  const listed = await ctx.readListed();

  expect(outcome).toMatchObject({ status: 'ok', result: { rendered: 'every Friday at 08:00' } });

  expect(listed[0]?.trigger).toStrictEqual({
    schedule: { every: 'week', on: 'fri', at: '08:00', zone: 'owner', catchUp: 'once' },
  });
});

test('#reminder.set refuses a schedule under the minimum gap with a sentence that names the limit', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { schedule: { every: { minutes: 5 } } },
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      refused: {
        code: 'MIN_GAP',
        sentence:
          'A recurring reminder fires at most every 15 minutes (reminders.min_gap_minutes).',
      },
    },
  });
});
