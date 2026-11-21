import { expect, test } from 'bun:test';
import { scheduleSchema } from '@heynixie/contract';
import { toNormalizedSchedule } from './to-normalized-schedule';

test.each<[string, Record<string, unknown>, Record<string, unknown>]>([
  [
    'a day with at',
    { every: 'day', at: '08:30' },
    { repeat: { frequency: 'daily', at: ['08:30'] }, hours: null },
  ],
  [
    'a week with on and at',
    { every: 'week', on: 'fri', at: '08:00' },
    { repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'] }, hours: null },
  ],
  ['an hour', { every: 'hour' }, { repeat: { frequency: 'hourly' }, hours: null }],
  [
    'minutes',
    { every: { minutes: 45 } },
    { repeat: { frequency: 'minutely', interval: 45 }, hours: null },
  ],
  [
    'a day with a window',
    { every: 'day', window: { from: '09:00', until: '17:00' } },
    {
      repeat: { frequency: 'daily', at: ['09:00'] },
      hours: { from: '09:00', until: '17:00' },
    },
  ],
])('it converts %s to the repeat shape', (_name, old, expected) => {
  const normalized = toNormalizedSchedule(scheduleSchema.parse(old));

  expect(normalized).toMatchObject(expected);
});

test('it keeps what an old window and its idle time need to fire as before', () => {
  const normalized = toNormalizedSchedule(
    scheduleSchema.parse({
      every: 'day',
      window: { from: '09:00', until: '17:00' },
      idleMinutes: 30,
    }),
  );

  expect(normalized.legacy).toStrictEqual({
    isEpochAnchored: false,
    isOncePerWindow: true,
    idleMinutes: 30,
  });
});

test('it anchors an old minutes schedule at the epoch and gives a repeat schedule no legacy', () => {
  const old = toNormalizedSchedule(scheduleSchema.parse({ every: { minutes: 10 } }));

  const current = toNormalizedSchedule(
    scheduleSchema.parse({ repeat: { frequency: 'daily', at: ['08:00'] } }),
  );

  expect([old.legacy?.isEpochAnchored, current.legacy]).toStrictEqual([true, null]);
});
