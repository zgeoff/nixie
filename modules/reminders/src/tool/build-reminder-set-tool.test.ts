import { expect, mock, test } from 'bun:test';
import type { RelatedMemoryLookup } from '@heynixie/tools';
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
    runSetWithMemory: (input: object, relatedMemory: RelatedMemoryLookup) =>
      buildReminderSetTool({ ...ctx.reminders, relatedMemory }).run(
        buildReminderToolCall('reminder.set', input),
        buildMockToolContext(),
      ),
    readListed: () =>
      readReminderList(ctx.writer.db, { now: ctx.clock.now(), readZone: ctx.reminders.readZone }),
  };
}

test('#reminder.set adds the matching active items to its result as related, after it applies', async () => {
  const ctx = await setupTest();

  const read = mock<RelatedMemoryLookup['read']>(() =>
    Promise.resolve([{ shortID: 'k3m9q2xzab', text: 'The tomatoes are in the greenhouse' }]),
  );

  const outcome = await ctx.runSetWithMemory(
    { name: 'Tomatoes', note: 'Water the tomatoes.', trigger: { at: '2027-03-10T08:00:00Z' } },
    { read, timeoutMs: 1000, log: mock() },
  );

  const listed = await ctx.readListed();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      reminder: expect.stringMatching(/^[0-9a-z]{10}$/u),
      rendered: 'once on Wed 10 Mar at 08:00',
      next: ['2027-03-10T08:00:00+00:00'],
      related: [{ shortID: 'k3m9q2xzab', text: 'The tomatoes are in the greenhouse' }],
    },
    record: {
      reminder: expect.stringMatching(/^[0-9a-z]{10}$/u),
      rendered: 'once on Wed 10 Mar at 08:00',
      next: ['2027-03-10T08:00:00+00:00'],
    },
  });

  expect(listed).toHaveLength(1);
  expect(read.mock.calls).toStrictEqual([['Tomatoes\nWater the tomatoes.']]);
});

test('#reminder.set leaves out related when nothing matches', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.runSetWithMemory(
    { name: 'Tomatoes', note: 'Water the tomatoes.', trigger: { at: '2027-03-10T08:00:00Z' } },
    { read: () => Promise.resolve([]), timeoutMs: 1000, log: mock() },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      reminder: expect.stringMatching(/^[0-9a-z]{10}$/u),
      rendered: 'once on Wed 10 Mar at 08:00',
      next: ['2027-03-10T08:00:00+00:00'],
    },
  });
});

test('#reminder.set applies with no related and logs the call ID when the lookup throws', async () => {
  const ctx = await setupTest();

  const log = mock<RelatedMemoryLookup['log']>();

  const outcome = await ctx.runSetWithMemory(
    { name: 'Tomatoes', note: 'Water the tomatoes.', trigger: { at: '2027-03-10T08:00:00Z' } },
    { read: () => Promise.reject(new Error('the index is down')), timeoutMs: 1000, log },
  );

  const listed = await ctx.readListed();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      reminder: expect.stringMatching(/^[0-9a-z]{10}$/u),
      rendered: 'once on Wed 10 Mar at 08:00',
      next: ['2027-03-10T08:00:00+00:00'],
    },
  });

  expect(listed).toHaveLength(1);

  expect(log.mock.calls).toStrictEqual([
    [
      'tool.related_memory_failed',
      { callID: expect.any(String), error: 'Error', message: 'the index is down' },
      'error',
    ],
  ]);
});

test('#reminder.set applies with no related and logs the call ID when the lookup runs past its deadline', async () => {
  const ctx = await setupTest();

  const log = mock<RelatedMemoryLookup['log']>();

  const outcome = await ctx.runSetWithMemory(
    { name: 'Tomatoes', note: 'Water the tomatoes.', trigger: { at: '2027-03-10T08:00:00Z' } },
    { read: () => new Promise(() => {}), timeoutMs: 20, log },
  );

  const listed = await ctx.readListed();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      reminder: expect.stringMatching(/^[0-9a-z]{10}$/u),
      rendered: 'once on Wed 10 Mar at 08:00',
      next: ['2027-03-10T08:00:00+00:00'],
    },
  });

  expect(listed).toHaveLength(1);

  expect(log.mock.calls).toStrictEqual([
    [
      'tool.related_memory_failed',
      { callID: expect.any(String), error: 'Error', message: 'the lookup ran past 20 ms' },
      'error',
    ],
  ]);
});

test('#reminder.set looks nothing up for a refused reminder', async () => {
  const ctx = await setupTest();

  const read = mock<RelatedMemoryLookup['read']>(() => Promise.resolve([]));

  await ctx.runSetWithMemory(
    {
      name: 'Tomatoes',
      note: 'Water the tomatoes.',
      trigger: {
        schedule: { repeat: { frequency: 'weekly', interval: 2, byDay: ['mon'], at: ['09:00'] } },
      },
    },
    { read, timeoutMs: 1000, log: mock() },
  );

  expect(read.mock.calls).toStrictEqual([]);
});

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
