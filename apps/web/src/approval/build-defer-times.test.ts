import { expect, test } from 'bun:test';
import { buildDeferTimes, isDeferInRange } from './build-defer-times';

function setupTest() {
  return {
    sydney: {
      defaultMinutes: 60,
      eveningAt: '18:00',
      morningAt: '08:00',
      zone: 'Australia/Sydney',
    },
  };
}

test('it offers the default minutes from now', () => {
  const ctx = setupTest();

  const times = buildDeferTimes(new Date('2026-11-16T01:00:00Z'), {
    ...ctx.sydney,
    defaultMinutes: 90,
  });

  expect(times.inDefaultMinutes).toStrictEqual(new Date('2026-11-16T02:30:00Z'));
});

test('it offers this evening at the evening time in the zone when that is still ahead', () => {
  const ctx = setupTest();

  // 12:00 in Sydney, which keeps daylight time in November
  const times = buildDeferTimes(new Date('2026-11-16T01:00:00Z'), ctx.sydney);

  expect(times.thisEvening).toStrictEqual(new Date('2026-11-16T07:00:00Z'));
});

test('it offers tomorrow evening once the evening time has passed', () => {
  const ctx = setupTest();

  // 20:00 in Sydney
  const times = buildDeferTimes(new Date('2026-11-16T09:00:00Z'), ctx.sydney);

  expect(times.thisEvening).toStrictEqual(new Date('2026-11-17T07:00:00Z'));
});

test('it offers tomorrow morning at the morning time in the zone', () => {
  const ctx = setupTest();
  const times = buildDeferTimes(new Date('2026-11-16T01:00:00Z'), ctx.sydney);

  expect(times.tomorrowMorning).toStrictEqual(new Date('2026-11-16T21:00:00Z'));
});

test('it reads the day in the zone, not in UTC', () => {
  const ctx = setupTest();

  // 08:30 on 17 November in Sydney is still 16 November in UTC
  const times = buildDeferTimes(new Date('2026-11-16T21:30:00Z'), ctx.sydney);

  expect(times.tomorrowMorning).toStrictEqual(new Date('2026-11-17T21:00:00Z'));
});

test('it keeps the morning time across the clock change that ends daylight time', () => {
  const ctx = setupTest();

  // Sydney ends daylight time on 5 April 2026, so the offset moves from +11 to +10
  const times = buildDeferTimes(new Date('2026-04-04T09:00:00Z'), ctx.sydney);

  expect(times.tomorrowMorning).toStrictEqual(new Date('2026-04-04T22:00:00Z'));
});

test('it keeps the evening time across the clock change that starts daylight time', () => {
  const ctx = setupTest();

  // Sydney starts daylight time on 4 October 2026, so the offset moves from +10 to +11
  const times = buildDeferTimes(new Date('2026-10-03T01:00:00Z'), ctx.sydney);

  expect(times.thisEvening).toStrictEqual(new Date('2026-10-03T08:00:00Z'));
  expect(times.tomorrowMorning).toStrictEqual(new Date('2026-10-03T21:00:00Z'));
});

test('it moves a time that the clock change skips on by the length of the gap', () => {
  const ctx = setupTest();

  // 02:30 on 4 October 2026 does not exist in Sydney
  const times = buildDeferTimes(new Date('2026-10-03T09:00:00Z'), {
    ...ctx.sydney,
    morningAt: '02:30',
  });

  expect(times.tomorrowMorning).toStrictEqual(new Date('2026-10-03T16:30:00Z'));
});

test.each([
  ['a minute ahead', 60_000, true],
  ['30 seconds ahead', 30_000, false],
  ['30 days ahead', 30 * 24 * 60 * 60_000, true],
  ['30 days and a minute ahead', 30 * 24 * 60 * 60_000 + 60_000, false],
  ['in the past', -60_000, false],
])('#isDeferInRange takes a custom time %s as %p', (_name, aheadMs, isInRange) => {
  const now = new Date('2026-11-16T01:00:00Z');
  const custom = new Date(now.getTime() + aheadMs);

  expect(isDeferInRange(now, custom)).toBe(isInRange);
});
