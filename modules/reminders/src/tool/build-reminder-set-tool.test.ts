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
      next: ['2027-03-10T08:00:00+00:00'],
    },
  });
});

test('#reminder.set sets a recurring reminder with the zone owner by default', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { schedule: { repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'] } } },
  });

  const listed = await ctx.readListed();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      reminder: expect.stringMatching(/^[0-9a-z]{10}$/u),
      rendered: 'every Friday at 08:00 (UTC)',
      next: ['2027-03-12T08:00:00+00:00', '2027-03-19T08:00:00+00:00', '2027-03-26T08:00:00+00:00'],
    },
  });

  expect(listed[0]?.trigger).toStrictEqual({
    schedule: {
      repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'], starts: '2027-03-09' },
      zone: 'owner',
      catchUp: 'once',
    },
  });
});

test('#reminder.set refuses an interval above 1 with no start date', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: {
      schedule: { repeat: { frequency: 'weekly', interval: 2, byDay: ['mon'], at: ['09:00'] } },
    },
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      refused: {
        code: 'STARTS_REQUIRED',
        path: 'trigger.schedule.repeat.starts',
        sentence:
          'An interval above 1 counts from a start date: add repeat.starts, such as "2026-11-23".',
      },
    },
    refusalCode: 'STARTS_REQUIRED',
  });
});

test('#reminder.set refuses a schedule under the minimum gap with a sentence that names the limit', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: {
      schedule: { repeat: { frequency: 'minutely', interval: 5, starts: '2026-11-21' } },
    },
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      refused: {
        code: 'MIN_GAP',
        path: 'trigger.schedule.repeat',
        sentence:
          'A schedule fires at most every 15 minutes, and 2 of its next fires lie closer than that. Widen the interval, or drop a time from at.',
      },
    },
    refusalCode: 'MIN_GAP',
  });
});

test('#reminder.set refuses a mix of fields with the field and a fix', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { schedule: { repeat: { frequency: 'daily' } } },
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      refused: {
        code: 'AT_REQUIRED',
        path: 'trigger.schedule.repeat.at',
        sentence:
          'A daily schedule needs the times of day it fires: add repeat.at, such as ["09:00"].',
      },
    },
    refusalCode: 'AT_REQUIRED',
  });
});

test('#reminder.set reads back the next 3 fires of an hourly reminder that hours limit', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.runSet({
    name: 'Stretch',
    note: 'Stand up and stretch.',
    trigger: {
      schedule: {
        repeat: { frequency: 'hourly', byDay: ['mon', 'tue', 'wed', 'thu', 'fri'] },
        hours: { from: '09:00', until: '17:00' },
      },
    },
  });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      rendered: 'every hour, on weekdays between 09:00 and 17:00 (UTC)',
      next: ['2027-03-09T09:00:00+00:00', '2027-03-09T10:00:00+00:00', '2027-03-09T11:00:00+00:00'],
    },
  });
});
