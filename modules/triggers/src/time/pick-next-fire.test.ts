import { expect, test } from 'bun:test';
import type { Trigger } from '@heynixie/contract';
import { triggerSchema } from '@heynixie/contract';
import { pickNextFire } from './pick-next-fire';

function setupTest() {
  return {
    buildSchedule: (schedule: Record<string, unknown>) => triggerSchema.parse({ schedule }),

    // the fires that follow a watermark, each one taking the watermark of the one before
    readFires: (trigger: Trigger, startMs: number, zone: string, count: number) => {
      const fires: { scheduledFor: number; dedupeKey: string }[] = [];
      let afterMs = startMs;

      for (let index = 0; index < count; index += 1) {
        const fire = pickNextFire('water-the-tomatoes', trigger, afterMs, zone);

        if (fire === null) {
          break;
        }

        fires.push({ scheduledFor: fire.scheduledFor, dedupeKey: fire.dedupeKey });

        afterMs = fire.scheduledFor;
      }

      return fires;
    },

    countFiresBetween: (trigger: Trigger, fromMs: number, untilMs: number, zone: string) => {
      let count = 0;
      let afterMs = fromMs - 1;

      for (;;) {
        const fire = pickNextFire('water-the-tomatoes', trigger, afterMs, zone);

        if (fire === null || fire.scheduledFor >= untilMs) {
          return count;
        }

        count += 1;
        afterMs = fire.scheduledFor;
      }
    },
  };
}

test('it gives the next Friday slot of a weekly schedule in the zone', () => {
  const ctx = setupTest();

  const fire = pickNextFire(
    'water-the-tomatoes',
    ctx.buildSchedule({ every: 'week', on: 'fri', at: '08:00' }),
    1_804_194_000_000,
    'Australia/Sydney',
  );

  expect(fire).toStrictEqual({
    scheduledFor: 1_804_798_800_000,
    until: null,
    dedupeKey: 'water-the-tomatoes|2027-03-12T08:00',
  });
});

test('it fires once per local day across a spring gap that skips the slot', () => {
  const ctx = setupTest();

  const fires = ctx.readFires(
    ctx.buildSchedule({ every: 'day', at: '02:30' }),
    Date.parse('2026-10-02T00:00:00Z'),
    'Australia/Sydney',
    4,
  );

  expect(fires).toStrictEqual([
    {
      scheduledFor: Date.parse('2026-10-02T16:30:00Z'),
      dedupeKey: 'water-the-tomatoes|2026-10-03T02:30',
    },
    {
      scheduledFor: Date.parse('2026-10-03T16:00:00Z'),
      dedupeKey: 'water-the-tomatoes|2026-10-04T02:30',
    },
    {
      scheduledFor: Date.parse('2026-10-04T15:30:00Z'),
      dedupeKey: 'water-the-tomatoes|2026-10-05T02:30',
    },
    {
      scheduledFor: Date.parse('2026-10-05T15:30:00Z'),
      dedupeKey: 'water-the-tomatoes|2026-10-06T02:30',
    },
  ]);
});

test('it fires once per local day across an autumn repeat, at the first of the 2 times', () => {
  const ctx = setupTest();

  const fires = ctx.readFires(
    ctx.buildSchedule({ every: 'day', at: '02:30' }),
    Date.parse('2026-04-03T00:00:00Z'),
    'Australia/Sydney',
    3,
  );

  expect(fires).toStrictEqual([
    {
      scheduledFor: Date.parse('2026-04-03T15:30:00Z'),
      dedupeKey: 'water-the-tomatoes|2026-04-04T02:30',
    },
    {
      scheduledFor: Date.parse('2026-04-04T15:30:00Z'),
      dedupeKey: 'water-the-tomatoes|2026-04-05T02:30',
    },
    {
      scheduledFor: Date.parse('2026-04-05T16:30:00Z'),
      dedupeKey: 'water-the-tomatoes|2026-04-06T02:30',
    },
  ]);
});

test('it fires 25 times on the day the clock goes back for an hour schedule', () => {
  const ctx = setupTest();

  const count = ctx.countFiresBetween(
    ctx.buildSchedule({ every: 'hour' }),
    Date.parse('2026-04-04T13:00:00Z'),
    Date.parse('2026-04-05T14:00:00Z'),
    'Australia/Sydney',
  );

  expect(count).toBe(25);
});

test('it fires 23 times on the day the clock goes forward for an hour schedule', () => {
  const ctx = setupTest();

  const count = ctx.countFiresBetween(
    ctx.buildSchedule({ every: 'hour' }),
    Date.parse('2026-10-03T14:00:00Z'),
    Date.parse('2026-10-04T13:00:00Z'),
    'Australia/Sydney',
  );

  expect(count).toBe(23);
});

test('it fires an hour schedule on the half hour of a zone with a half-hour offset', () => {
  const ctx = setupTest();

  const fire = pickNextFire(
    'water-the-tomatoes',
    ctx.buildSchedule({ every: 'hour' }),
    Date.parse('2027-03-09T03:00:00Z'),
    'Asia/Kolkata',
  );

  expect(fire?.scheduledFor).toBe(Date.parse('2027-03-09T03:30:00Z'));
});

test('it fires once per local date when the zone changes between fires', () => {
  const ctx = setupTest();
  const trigger = ctx.buildSchedule({ every: 'day', at: '08:00' });

  const taken = new Set<string>();

  const keys: string[] = [];
  let afterMs = Date.parse('2027-03-09T00:00:00Z');

  for (let index = 0; index < 6; index += 1) {
    const zone = index < 3 ? 'Australia/Sydney' : 'Europe/Lisbon';
    const fire = pickNextFire('water-the-tomatoes', trigger, afterMs, zone);

    afterMs = fire?.scheduledFor ?? afterMs;

    if (fire !== null && !taken.has(fire.dedupeKey)) {
      taken.add(fire.dedupeKey);
      keys.push(fire.dedupeKey);
    }
  }

  expect(keys).toStrictEqual([
    'water-the-tomatoes|2027-03-10T08:00',
    'water-the-tomatoes|2027-03-11T08:00',
    'water-the-tomatoes|2027-03-12T08:00',
    'water-the-tomatoes|2027-03-13T08:00',
    'water-the-tomatoes|2027-03-14T08:00',
  ]);
});

test('it gives window.from and window.until for a window that ends the next day', () => {
  const ctx = setupTest();

  const fire = pickNextFire(
    'water-the-tomatoes',
    ctx.buildSchedule({
      every: 'day',
      window: { from: '22:00', until: '02:00' },
      idleMinutes: 30,
    }),
    Date.parse('2027-03-10T00:00:00Z'),
    'Australia/Sydney',
  );

  expect(fire).toStrictEqual({
    scheduledFor: Date.parse('2027-03-10T11:00:00Z'),
    until: Date.parse('2027-03-10T15:00:00Z'),
    dedupeKey: 'water-the-tomatoes|2027-03-10T22:00',
  });
});

test('it gives window.until on the same day for a window that ends that day', () => {
  const ctx = setupTest();

  const fire = pickNextFire(
    'water-the-tomatoes',
    ctx.buildSchedule({ every: 'day', window: { from: '07:00', until: '09:00' } }),
    Date.parse('2027-03-10T00:00:00Z'),
    'Australia/Sydney',
  );

  expect(fire?.until).toBe(Date.parse('2027-03-10T22:00:00Z'));
});

test.each([0, Date.parse('2030-01-01T00:00:00Z')])(
  'it gives the instant of an at trigger for the watermark %p',
  (afterMs) => {
    const fire = pickNextFire(
      'dentist',
      { at: '2027-03-09T14:00:00+11:00' },
      afterMs,
      'Australia/Sydney',
    );

    expect(fire).toStrictEqual({
      scheduledFor: Date.parse('2027-03-09T03:00:00Z'),
      until: null,
      dedupeKey: 'dentist|2027-03-09T03:00:00.000Z',
    });
  },
);

test.each([
  [0, 2_700_000],
  [2_700_000, 5_400_000],
  [10_000_000, 10_800_000],
])('it fires a 45-minute schedule after the watermark %p at %p', (afterMs, expected) => {
  const ctx = setupTest();

  const fire = pickNextFire(
    'water-the-tomatoes',
    ctx.buildSchedule({ every: { minutes: 45 } }),
    afterMs,
    'Australia/Sydney',
  );

  expect(fire?.scheduledFor).toBe(expected);
});

test('it keys a minutes fire by its UTC instant', () => {
  const ctx = setupTest();

  const fire = pickNextFire(
    'water-the-tomatoes',
    ctx.buildSchedule({ every: { minutes: 5 } }),
    Date.parse('2027-03-09T03:02:00Z'),
    'Australia/Sydney',
  );

  expect(fire?.dedupeKey).toBe('water-the-tomatoes|2027-03-09T03:05:00.000Z');
});
