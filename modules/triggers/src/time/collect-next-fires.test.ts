import { expect, test } from 'bun:test';
import { triggerSchema } from '@heynixie/contract';
import { collectNextFires } from './collect-next-fires';

function setupTest() {
  return {
    collect: (schedule: Record<string, unknown>, afterIso: string, zone: string, count: number) =>
      collectNextFires('water-the-tomatoes', triggerSchema.parse({ schedule }), {
        afterMs: Date.parse(afterIso),
        zone,
        count,
      }).map((fire) => new Date(fire.scheduledFor).toISOString()),
  };
}

test('it fires hourly only from 09:00 to 17:00 on weekdays, across a night and a weekend', () => {
  const ctx = setupTest();

  const fires = ctx.collect(
    {
      repeat: { frequency: 'hourly', byDay: ['mon', 'tue', 'wed', 'thu', 'fri'] },
      hours: { from: '09:00', until: '17:00' },
      zone: 'UTC',
    },
    '2026-11-20T15:30:00Z',
    'UTC',
    12,
  );

  expect(fires).toStrictEqual([
    '2026-11-20T16:00:00.000Z',
    '2026-11-20T17:00:00.000Z',
    '2026-11-23T09:00:00.000Z',
    '2026-11-23T10:00:00.000Z',
    '2026-11-23T11:00:00.000Z',
    '2026-11-23T12:00:00.000Z',
    '2026-11-23T13:00:00.000Z',
    '2026-11-23T14:00:00.000Z',
    '2026-11-23T15:00:00.000Z',
    '2026-11-23T16:00:00.000Z',
    '2026-11-23T17:00:00.000Z',
    '2026-11-24T09:00:00.000Z',
  ]);
});

test('it fires hourly hours that run past midnight', () => {
  const ctx = setupTest();

  const fires = ctx.collect(
    {
      repeat: { frequency: 'hourly', interval: 2, starts: '2026-11-21' },
      hours: { from: '22:00', until: '02:00' },
      zone: 'UTC',
    },
    '2026-11-21T20:00:00Z',
    'UTC',
    4,
  );

  expect(fires).toStrictEqual([
    '2026-11-21T22:00:00.000Z',
    '2026-11-22T00:00:00.000Z',
    '2026-11-22T02:00:00.000Z',
    '2026-11-22T22:00:00.000Z',
  ]);
});

test('it fires on the last Friday of each month at 17:00', () => {
  const ctx = setupTest();

  const fires = ctx.collect(
    {
      repeat: { frequency: 'monthly', byDay: [{ day: 'fri', nth: -1 }], at: ['17:00'] },
      zone: 'UTC',
    },
    '2026-11-21T00:00:00Z',
    'UTC',
    3,
  );

  expect(fires).toStrictEqual([
    '2026-11-27T17:00:00.000Z',
    '2026-12-25T17:00:00.000Z',
    '2027-01-29T17:00:00.000Z',
  ]);
});

test('it fires every 2 weeks on Monday from a start date', () => {
  const ctx = setupTest();

  const fires = ctx.collect(
    {
      repeat: {
        frequency: 'weekly',
        interval: 2,
        byDay: ['mon'],
        at: ['09:00'],
        starts: '2026-11-09',
      },
      zone: 'UTC',
    },
    '2026-11-10T00:00:00Z',
    'UTC',
    3,
  );

  expect(fires).toStrictEqual([
    '2026-11-23T09:00:00.000Z',
    '2026-12-07T09:00:00.000Z',
    '2026-12-21T09:00:00.000Z',
  ]);
});

test('it fires at several times a day, each in order', () => {
  const ctx = setupTest();

  const fires = ctx.collect(
    { repeat: { frequency: 'daily', at: ['17:00', '09:30'] }, zone: 'UTC' },
    '2026-11-21T00:00:00Z',
    'UTC',
    3,
  );

  expect(fires).toStrictEqual([
    '2026-11-21T09:30:00.000Z',
    '2026-11-21T17:00:00.000Z',
    '2026-11-22T09:30:00.000Z',
  ]);
});

test('it fires a daily 02:30 at the first instant after the gap on a spring-forward day', () => {
  const ctx = setupTest();

  const fires = ctx.collect(
    { repeat: { frequency: 'daily', at: ['02:30'] }, zone: 'Australia/Sydney' },
    '2026-10-03T00:00:00Z',
    'Australia/Sydney',
    3,
  );

  // Sydney's clocks jump from 02:00 to 03:00 on 4 Oct 2026, so 02:30 does not exist that day
  expect(fires).toStrictEqual([
    '2026-10-03T16:00:00.000Z',
    '2026-10-04T15:30:00.000Z',
    '2026-10-05T15:30:00.000Z',
  ]);
});

test('it fires a daily 02:30 once, at the first of the two, on a fall-back day', () => {
  const ctx = setupTest();

  const fires = ctx.collect(
    { repeat: { frequency: 'daily', at: ['02:30'] }, zone: 'Australia/Sydney' },
    '2027-04-02T20:00:00Z',
    'Australia/Sydney',
    3,
  );

  // Sydney's clocks go from 03:00 back to 02:00 on 4 Apr 2027, so 02:30 shows twice
  expect(fires).toStrictEqual([
    '2027-04-03T15:30:00.000Z',
    '2027-04-04T16:30:00.000Z',
    '2027-04-05T16:30:00.000Z',
  ]);
});

test('it fires a monthly schedule on the 31st only in the months that have one', () => {
  const ctx = setupTest();

  const fires = ctx.collect(
    { repeat: { frequency: 'monthly', byMonthDay: [31], at: ['08:00'] }, zone: 'UTC' },
    '2026-11-21T00:00:00Z',
    'UTC',
    3,
  );

  expect(fires).toStrictEqual([
    '2026-12-31T08:00:00.000Z',
    '2027-01-31T08:00:00.000Z',
    '2027-03-31T08:00:00.000Z',
  ]);
});

test('it gives no fire for a day that never exists', () => {
  const ctx = setupTest();

  const fires = ctx.collect(
    {
      repeat: { frequency: 'yearly', byMonth: [2], byMonthDay: [30], at: ['08:00'] },
      zone: 'UTC',
    },
    '2026-11-21T00:00:00Z',
    'UTC',
    3,
  );

  expect(fires).toStrictEqual([]);
});

test('it fires every 15 minutes from the start of the start date', () => {
  const ctx = setupTest();

  const fires = ctx.collect(
    { repeat: { frequency: 'minutely', interval: 15, starts: '2026-11-21' }, zone: 'UTC' },
    '2026-11-21T10:07:00Z',
    'UTC',
    2,
  );

  expect(fires).toStrictEqual(['2026-11-21T10:15:00.000Z', '2026-11-21T10:30:00.000Z']);
});
