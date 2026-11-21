import { expect, test } from 'bun:test';
import { repeatScheduleSchema } from '@heynixie/contract';
import { checkSchedule } from './check-schedule';

function setupTest() {
  return {
    check: (schedule: Record<string, unknown>) =>
      checkSchedule(repeatScheduleSchema.parse(schedule), {
        nowMs: Date.parse('2026-11-21T01:00:00Z'),
        ownerZone: 'Australia/Sydney',
        minGapMinutes: 15,
      }),
  };
}

test('it fills the start date with the local date of now and sorts the times', () => {
  const ctx = setupTest();
  const checked = ctx.check({ repeat: { frequency: 'daily', at: ['17:00', '09:00', '17:00'] } });

  expect(checked).toStrictEqual({
    status: 'ok',
    schedule: {
      repeat: { frequency: 'daily', at: ['09:00', '17:00'], starts: '2026-11-21' },
      zone: 'owner',
      catchUp: 'once',
    },
  });
});

test('it keeps a start date it is given', () => {
  const ctx = setupTest();

  const checked = ctx.check({
    repeat: {
      frequency: 'weekly',
      interval: 2,
      byDay: ['mon'],
      at: ['09:00'],
      starts: '2026-11-09',
    },
  });

  expect(checked).toMatchObject({ status: 'ok', schedule: { repeat: { starts: '2026-11-09' } } });
});

test.each([
  [
    'a daily schedule with no times',
    { repeat: { frequency: 'daily' } },
    'AT_REQUIRED',
    'repeat.at',
  ],
  [
    'an hourly schedule with times',
    { repeat: { frequency: 'hourly', at: ['09:00'] } },
    'AT_NOT_ALLOWED',
    'repeat.at',
  ],
  [
    'an nth weekday on a weekly schedule',
    { repeat: { frequency: 'weekly', byDay: [{ day: 'fri', nth: -1 }], at: ['09:00'] } },
    'NTH_NOT_ALLOWED',
    'repeat.byDay',
  ],
  [
    'a day of the month on a weekly schedule',
    { repeat: { frequency: 'weekly', byMonthDay: [1], at: ['09:00'] } },
    'BY_MONTH_DAY_NOT_ALLOWED',
    'repeat.byMonthDay',
  ],
  [
    'a day that no month has',
    { repeat: { frequency: 'yearly', byMonth: [2], byMonthDay: [30], at: ['09:00'] } },
    'NO_FIRE',
    'repeat',
  ],
  [
    'a time outside the hours',
    { repeat: { frequency: 'daily', at: ['03:00'] }, hours: { from: '09:00', until: '17:00' } },
    'NO_FIRE',
    'repeat',
  ],
  [
    'a minute schedule closer than the minimum gap',
    { repeat: { frequency: 'minutely', interval: 5 } },
    'MIN_GAP',
    'repeat',
  ],
  [
    'two times a day closer than the minimum gap',
    { repeat: { frequency: 'daily', at: ['09:00', '09:10'] } },
    'MIN_GAP',
    'repeat',
  ],
])('it refuses %s', (_name, schedule, code, path) => {
  const ctx = setupTest();
  const checked = ctx.check(schedule);

  expect(checked).toMatchObject({ status: 'refused', code, path });

  expect(checked).toStrictEqual({
    status: 'refused',
    code: expect.any(String),
    path,
    sentence: expect.stringMatching(/\.$/u),
  });
});

test('it accepts an hourly schedule that the hours limit', () => {
  const ctx = setupTest();

  const checked = ctx.check({
    repeat: { frequency: 'hourly', byDay: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    hours: { from: '09:00', until: '17:00' },
  });

  expect(checked.status).toBe('ok');
});
