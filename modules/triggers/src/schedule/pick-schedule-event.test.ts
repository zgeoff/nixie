import { expect, test } from 'bun:test';
import { triggerSchema } from '@heynixie/contract';
import { pickScheduleEvent } from './pick-schedule-event';

interface HoldIso {
  readonly slot: string;
  readonly until: string;
}

function setupTest() {
  return {
    pick: (trigger: unknown, after: string, now: string, lastMessageAt: string | null = null) =>
      pickScheduleEvent({
        row: {
          definitionID: 'water-the-tomatoes',
          definitionHash: 'hash-1',
          target: 'task',
          trigger: triggerSchema.parse(trigger),
          after: Date.parse(after),
          hold: null,
        },
        zone: 'UTC',
        nowMs: Date.parse(now),
        lastMessageAtMs: lastMessageAt === null ? null : Date.parse(lastMessageAt),
      }),
    pickHeld: (trigger: unknown, after: string, now: string, hold: HoldIso) =>
      pickScheduleEvent({
        row: {
          definitionID: 'water-the-tomatoes',
          definitionHash: 'hash-1',
          target: 'conversation',
          trigger: triggerSchema.parse(trigger),
          after: Date.parse(after),
          hold: { slot: Date.parse(hold.slot), until: Date.parse(hold.until) },
        },
        zone: 'UTC',
        nowMs: Date.parse(now),
        lastMessageAtMs: null,
      }),
  };
}

test.each([
  [
    'a slot not yet due',
    { schedule: { every: { minutes: 5 } } },
    '2027-03-09T12:00:00Z',
    '2027-03-09T12:04:59Z',
    null,
    null,
  ],
  [
    'a slot on time',
    { schedule: { every: { minutes: 5 } } },
    '2027-03-09T12:00:00Z',
    '2027-03-09T12:05:30Z',
    null,
    { scheduledFor: '2027-03-09T12:05:00.000Z', skip: null },
  ],
  [
    'a catch-up within half the interval',
    { schedule: { every: { minutes: 5 } } },
    '2027-03-09T12:00:00Z',
    '2027-03-09T12:07:30Z',
    null,
    { scheduledFor: '2027-03-09T12:05:00.000Z', skip: null },
  ],
  [
    'a slot beyond half the interval',
    { schedule: { every: { minutes: 5 } } },
    '2027-03-09T12:00:00Z',
    '2027-03-09T12:07:31Z',
    null,
    { scheduledFor: '2027-03-09T12:05:00.000Z', skip: 'too_late' },
  ],
  [
    'a late slot with catch-up off',
    { schedule: { every: { minutes: 5 }, catchUp: 'skip' } },
    '2027-03-09T12:00:00Z',
    '2027-03-09T12:06:10Z',
    null,
    { scheduledFor: '2027-03-09T12:05:00.000Z', skip: 'catch_up_off' },
  ],
  [
    'an on-time slot with catch-up off',
    { schedule: { every: { minutes: 5 }, catchUp: 'skip' } },
    '2027-03-09T12:00:00Z',
    '2027-03-09T12:05:59Z',
    null,
    { scheduledFor: '2027-03-09T12:05:00.000Z', skip: null },
  ],
  [
    'an idle window while the conversation is busy',
    { schedule: { every: 'day', window: { from: '09:00', until: '17:00' }, idleMinutes: 30 } },
    '2027-03-08T10:00:00Z',
    '2027-03-09T10:00:00Z',
    '2027-03-09T09:50:00Z',
    null,
  ],
  [
    'an idle window once the conversation is idle',
    { schedule: { every: 'day', window: { from: '09:00', until: '17:00' }, idleMinutes: 30 } },
    '2027-03-08T10:00:00Z',
    '2027-03-09T10:00:00Z',
    '2027-03-09T09:30:00Z',
    { scheduledFor: '2027-03-09T09:00:00.000Z', skip: null },
  ],
  [
    'an idle window with no message at all',
    { schedule: { every: 'day', window: { from: '09:00', until: '17:00' }, idleMinutes: 30 } },
    '2027-03-08T10:00:00Z',
    '2027-03-09T10:00:00Z',
    null,
    { scheduledFor: '2027-03-09T09:00:00.000Z', skip: null },
  ],
  [
    'an idle window past its end',
    { schedule: { every: 'day', window: { from: '09:00', until: '17:00' }, idleMinutes: 30 } },
    '2027-03-08T10:00:00Z',
    '2027-03-09T17:00:01Z',
    '2027-03-09T17:00:00Z',
    { scheduledFor: '2027-03-09T09:00:00.000Z', skip: 'window_closed' },
  ],
  [
    'an idle window past its end with catch-up off',
    {
      schedule: {
        every: 'day',
        window: { from: '09:00', until: '17:00' },
        idleMinutes: 30,
        catchUp: 'skip',
      },
    },
    '2027-03-08T10:00:00Z',
    '2027-03-09T18:00:00Z',
    null,
    { scheduledFor: '2027-03-09T09:00:00.000Z', skip: 'window_closed' },
  ],
  [
    'a window without idleMinutes inside the window',
    { schedule: { every: 'day', window: { from: '09:00', until: '17:00' } } },
    '2027-03-08T10:00:00Z',
    '2027-03-09T16:59:00Z',
    null,
    { scheduledFor: '2027-03-09T09:00:00.000Z', skip: null },
  ],
  [
    'a window without idleMinutes past its end, within half the interval',
    { schedule: { every: 'day', window: { from: '09:00', until: '17:00' } } },
    '2027-03-08T10:00:00Z',
    '2027-03-09T20:59:00Z',
    null,
    { scheduledFor: '2027-03-09T09:00:00.000Z', skip: null },
  ],
  [
    'a window without idleMinutes past its end, beyond half the interval',
    { schedule: { every: 'day', window: { from: '09:00', until: '17:00' } } },
    '2027-03-08T10:00:00Z',
    '2027-03-09T21:01:00Z',
    null,
    { scheduledFor: '2027-03-09T09:00:00.000Z', skip: 'too_late' },
  ],
  [
    'an hourly slot caught up past the hours',
    {
      schedule: {
        repeat: { frequency: 'hourly', byDay: ['mon', 'tue', 'wed', 'thu', 'fri'] },
        hours: { from: '09:00', until: '17:00' },
        zone: 'UTC',
      },
    },
    '2027-03-09T16:00:00Z',
    '2027-03-09T17:25:00Z',
    null,
    { scheduledFor: '2027-03-09T17:00:00.000Z', skip: 'too_late' },
  ],
  [
    'an hourly slot caught up inside the hours',
    {
      schedule: {
        repeat: { frequency: 'hourly', byDay: ['mon', 'tue', 'wed', 'thu', 'fri'] },
        hours: { from: '09:00', until: '17:00' },
        zone: 'UTC',
      },
    },
    '2027-03-09T09:00:00Z',
    '2027-03-09T10:25:00Z',
    null,
    { scheduledFor: '2027-03-09T10:00:00.000Z', skip: null },
  ],
  [
    'an hourly slot 1 minute late across the end of the hours',
    {
      schedule: {
        repeat: { frequency: 'hourly', byDay: ['mon', 'tue', 'wed', 'thu', 'fri'] },
        hours: { from: '09:00', until: '17:00' },
        zone: 'UTC',
      },
    },
    '2027-03-09T16:00:00Z',
    '2027-03-09T17:01:00Z',
    null,
    { scheduledFor: '2027-03-09T17:00:00.000Z', skip: 'too_late' },
  ],
  [
    'a daily slot caught up overnight past the hours',
    {
      schedule: {
        repeat: { frequency: 'daily', at: ['16:50'] },
        hours: { from: '09:00', until: '17:00' },
        zone: 'UTC',
      },
    },
    '2027-03-08T16:50:00Z',
    '2027-03-10T03:00:00Z',
    null,
    { scheduledFor: '2027-03-09T16:50:00.000Z', skip: 'too_late' },
  ],
  [
    'a one-shot that is not yet due',
    { at: '2027-03-09T10:00:00Z' },
    '2027-03-09T00:00:00Z',
    '2027-03-09T09:59:59Z',
    null,
    null,
  ],
  [
    'a one-shot a year late',
    { at: '2027-03-09T10:00:00Z' },
    '2027-03-09T00:00:00Z',
    '2028-03-09T10:00:00Z',
    null,
    { scheduledFor: '2027-03-09T10:00:00.000Z', skip: null },
  ],
])('it picks for %s', (...row) => {
  const ctx = setupTest();
  const [, trigger, after, now, lastMessageAt, expected] = row;
  const event = ctx.pick(trigger, after, now, lastMessageAt);

  const summary: unknown =
    event === null ? null : { scheduledFor: event.scheduledFor, skip: event.skip ?? null };

  expect(summary).toStrictEqual(expected);
});

test('it keeps the key, the kind and the times of a fire', () => {
  const ctx = setupTest();

  const event = ctx.pick(
    { schedule: { every: { minutes: 5 } } },
    '2027-03-09T12:00:00Z',
    '2027-03-09T12:05:10Z',
  );

  expect(event).toStrictEqual({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    kind: 'schedule',
    dedupeKey: 'water-the-tomatoes|2027-03-09T12:05:00.000Z',
    scheduledFor: '2027-03-09T12:05:00.000Z',
    occurredAt: '2027-03-09T12:05:10.000Z',
    missed: [],
    missedCount: 0,
    payload: null,
  });
});

test('it gives a one-shot the kind at and no missed slots', () => {
  const ctx = setupTest();

  const event = ctx.pick(
    { at: '2027-03-09T10:00:00Z' },
    '2027-03-09T00:00:00Z',
    '2027-03-09T10:00:05Z',
  );

  expect(event).toStrictEqual({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    kind: 'at',
    dedupeKey: 'water-the-tomatoes|2027-03-09T10:00:00.000Z',
    scheduledFor: '2027-03-09T10:00:00.000Z',
    occurredAt: '2027-03-09T10:00:05.000Z',
    missed: [],
    missedCount: 0,
    payload: null,
  });
});

test('it carries the earlier slots as missed when the newest is on time', () => {
  const ctx = setupTest();

  const event = ctx.pick(
    { schedule: { every: { minutes: 5 }, catchUp: 'skip' } },
    '2027-03-09T11:50:00Z',
    '2027-03-09T12:05:10Z',
  );

  expect([event?.skip, event?.missed, event?.missedCount]).toStrictEqual([
    undefined,
    ['2027-03-09T11:55:00.000Z', '2027-03-09T12:00:00.000Z'],
    2,
  ]);
});

test('it counts every missed slot of a year of downtime and keeps the newest 20', () => {
  const ctx = setupTest();
  const startedAt = performance.now();

  const event = ctx.pick(
    { schedule: { every: { minutes: 5 } } },
    '2026-03-09T00:00:00Z',
    '2027-03-09T00:00:00Z',
  );

  const tookMs = performance.now() - startedAt;

  expect([event?.skip, event?.missed.length, event?.missedCount]).toStrictEqual([
    undefined,
    20,
    365 * 288 - 1,
  ]);

  expect(event?.missed.at(0)).toBe('2027-03-08T22:20:00.000Z');
  expect(event?.missed.at(-1)).toBe('2027-03-08T23:55:00.000Z');
  expect(tookMs).toBeLessThan(1000);
});

test('it walks the local slots across a daylight-saving change once each', () => {
  const event = pickScheduleEvent({
    row: {
      definitionID: 'water-the-tomatoes',
      definitionHash: 'hash-1',
      target: 'task',
      trigger: triggerSchema.parse({
        schedule: { every: 'day', at: '08:00', zone: 'Australia/Sydney' },
      }),
      after: Date.parse('2027-04-01T00:00:00Z'),
      hold: null,
    },
    zone: 'Australia/Sydney',
    nowMs: Date.parse('2027-04-06T00:00:00Z'),
    lastMessageAtMs: null,
  });

  expect([event?.skip, event?.scheduledFor, event?.missedCount, event?.missed]).toStrictEqual([
    undefined,
    '2027-04-05T22:00:00.000Z',
    4,
    [
      '2027-04-01T21:00:00.000Z',
      '2027-04-02T21:00:00.000Z',
      '2027-04-03T22:00:00.000Z',
      '2027-04-04T22:00:00.000Z',
    ],
  ]);
});

test('it waits while a snooze holds the slot', () => {
  const ctx = setupTest();

  const event = ctx.pickHeld(
    {
      schedule: {
        repeat: { frequency: 'daily', at: ['09:00'], starts: '2027-03-01' },
        zone: 'UTC',
      },
    },
    '2027-03-08T09:00:00Z',
    '2027-03-09T12:00:00Z',
    { slot: '2027-03-09T09:00:00Z', until: '2027-03-09T15:00:00Z' },
  );

  expect(event).toBeNull();
});

test('it fires the held slot once its hold ends, however late it is', () => {
  const ctx = setupTest();

  const event = ctx.pickHeld(
    {
      schedule: {
        repeat: { frequency: 'daily', at: ['09:00'], starts: '2027-03-01' },
        zone: 'UTC',
      },
    },
    '2027-03-08T09:00:00Z',
    '2027-03-09T15:00:10Z',
    { slot: '2027-03-09T09:00:00Z', until: '2027-03-09T15:00:00Z' },
  );

  expect([event?.scheduledFor, event?.skip, event?.missedCount]).toStrictEqual([
    '2027-03-09T09:00:00.000Z',
    undefined,
    0,
  ]);
});

test('it counts a released held slot as missed when a later slot is due too', () => {
  const ctx = setupTest();

  const event = ctx.pickHeld(
    {
      schedule: {
        repeat: { frequency: 'daily', at: ['09:00'], starts: '2027-03-01' },
        zone: 'UTC',
      },
    },
    '2027-03-08T09:00:00Z',
    '2027-03-10T09:00:20Z',
    { slot: '2027-03-09T09:00:00Z', until: '2027-03-09T15:00:00Z' },
  );

  expect([event?.scheduledFor, event?.missedCount]).toStrictEqual(['2027-03-10T09:00:00.000Z', 1]);
});
