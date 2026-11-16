import { expect, test } from 'bun:test';
import { buildTriggerDetails } from './build-trigger-details';

function setupTest() {
  const onTime = {
    kind: 'schedule',
    scheduledFor: '2026-06-03T20:30:00.000Z',
    isCatchUp: false,
    skipped: [],
    skippedCount: 0,
  } as const;

  return { onTime };
}

test('it says an on-time fire in the zone with its offset', () => {
  const ctx = setupTest();

  const details = buildTriggerDetails(
    ctx.onTime,
    new Date('2026-06-03T20:31:05.000Z'),
    'Australia/Sydney',
  );

  expect(details).toStrictEqual({
    kind: 'schedule',
    scheduledFor: '2026-06-04T06:30:00+10:00',
    startedAt: '2026-06-04T06:31:05+10:00',
    isCatchUp: false,
    skipped: [],
    skippedCount: 0,
    sentence: 'This task run was scheduled for Thu 4 Jun, 06:30 and started at 06:31.',
  });
});

test('it says a catch-up with one skipped time', () => {
  const ctx = setupTest();

  const details = buildTriggerDetails(
    { ...ctx.onTime, isCatchUp: true, skipped: ['2026-06-02T20:30:00.000Z'], skippedCount: 1 },
    new Date('2026-06-03T22:15:00.000Z'),
    'Australia/Sydney',
  );

  expect(details).toMatchObject({
    skipped: ['2026-06-03T06:30:00+10:00'],
    sentence:
      'This task run was scheduled for Thu 4 Jun, 06:30 and started at 08:15 as a catch-up. Skipped: Wed 3 Jun, 06:30.',
  });
});

test('it shows the full date of a start on the next local date', () => {
  const ctx = setupTest();

  const details = buildTriggerDetails(
    { ...ctx.onTime, scheduledFor: '2026-06-04T13:30:00.000Z' },
    new Date('2026-06-04T14:10:00.000Z'),
    'Australia/Sydney',
  );

  expect(details.sentence).toBe(
    'This task run was scheduled for Thu 4 Jun, 23:30 and started at Fri 5 Jun, 00:10.',
  );
});

test('it lists the newest 20 of 26 skipped times and says the count', () => {
  const ctx = setupTest();

  const skipped = Array.from(
    { length: 20 },
    (_, index) => `2026-06-${String(index + 1).padStart(2, '0')}T20:30:00.000Z`,
  );

  const details = buildTriggerDetails(
    {
      ...ctx.onTime,
      scheduledFor: '2026-06-25T20:30:00.000Z',
      isCatchUp: true,
      skipped,
      skippedCount: 26,
    },
    new Date('2026-06-25T22:00:00.000Z'),
    'Australia/Sydney',
  );

  expect(details.skipped).toHaveLength(20);

  expect(details.sentence).toStartWith(
    'This task run was scheduled for Fri 26 Jun, 06:30 and started at 08:00 as a catch-up. Skipped 26, the newest 20: Tue 2 Jun, 06:30; Wed 3 Jun, 06:30;',
  );

  expect(details.sentence).toEndWith('Sun 21 Jun, 06:30.');
});

test('it follows a daylight-saving change in the offset', () => {
  const ctx = setupTest();

  const details = buildTriggerDetails(
    { ...ctx.onTime, scheduledFor: '2026-04-04T14:30:00.000Z' },
    new Date('2026-04-05T20:30:00.000Z'),
    'Australia/Sydney',
  );

  expect(details).toMatchObject({
    scheduledFor: '2026-04-05T01:30:00+11:00',
    startedAt: '2026-04-06T06:30:00+10:00',
  });
});
