import { expect, test } from 'bun:test';
import { triggerSchema } from '@heynixie/contract';
import fc from 'fast-check';
import { pickNextFire } from './pick-next-fire';
import { renderTrigger } from './render-trigger';

function setupTest() {
  const clockTime = fc
    .tuple(fc.nat(23), fc.nat(59))
    .map(([hour, minute]) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);

  const everyMinutes = fc.record({ minutes: fc.integer({ min: 5, max: 1440 }) });

  return {
    buildSchedule: (schedule: Record<string, unknown>) => triggerSchema.parse({ schedule }),
    scheduleArbitrary: fc.oneof(
      fc.record({ every: fc.constant('day'), at: clockTime }),
      fc.record({
        every: fc.constant('week'),
        on: fc.constantFrom('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'),
        at: clockTime,
      }),
      fc.record({ every: fc.constant('hour') }),
      fc.record({ every: everyMinutes }),
    ),
  };
}

test.each([
  [{ every: 'day', at: '06:30' }, 'every day at 06:30 (Australia/Sydney)', 'Tue 9 Mar'],
  [
    { every: 'week', on: 'fri', at: '08:00' },
    'every Friday at 08:00 (Australia/Sydney)',
    'Fri 12 Mar',
  ],
  [{ every: { minutes: 45 } }, 'every 45 minutes (Australia/Sydney)', 'Mon 8 Mar at 11:45'],
  [{ every: 'hour' }, 'every hour (Australia/Sydney)', 'Mon 8 Mar at 12:00'],
  [
    { every: 'day', window: { from: '07:00', until: '09:00' } },
    'every day between 07:00 and 09:00 (Australia/Sydney)',
    'Tue 9 Mar',
  ],
  [
    { every: 'week', on: 'mon', window: { from: '07:00', until: '09:00' }, idleMinutes: 20 },
    'every Monday between 07:00 and 09:00, once idle for 20 minutes (Australia/Sydney)',
    'Mon 15 Mar',
  ],
])('it renders the schedule %j as %p with next %p', (schedule, rendered, next) => {
  const ctx = setupTest();

  const result = renderTrigger(
    ctx.buildSchedule(schedule),
    Date.parse('2027-03-08T00:00:00Z'),
    'Australia/Sydney',
  );

  expect(result).toStrictEqual({ rendered, next });
});

test('it renders a one-shot with its date and time in the zone', () => {
  const result = renderTrigger(
    { at: '2027-03-09T14:00:00+11:00' },
    Date.parse('2027-03-08T00:00:00Z'),
    'Australia/Sydney',
  );

  expect(result).toStrictEqual({ rendered: 'once on Tue 9 Mar at 14:00', next: 'Tue 9 Mar' });
});

test('it renders the next fire of random schedules across a daylight-saving change', () => {
  const ctx = setupTest();

  const watermarks = fc.integer({
    min: Date.parse('2027-03-05T00:00:00Z'),
    max: Date.parse('2027-04-10T00:00:00Z'),
  });

  const zones = fc.constantFrom('Australia/Sydney', 'Europe/Lisbon', 'America/New_York');

  fc.assert(
    fc.property(ctx.scheduleArbitrary, zones, watermarks, (schedule, zone, watermark) => {
      const trigger = ctx.buildSchedule(schedule);
      const fire = pickNextFire('water-the-tomatoes', trigger, watermark, zone);
      const options = { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' } as const;

      const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(fire?.scheduledFor);

      const date = ['weekday', 'day', 'month']
        .map((type) => parts.find((part) => part.type === type)?.value)
        .join(' ');

      expect(renderTrigger(trigger, watermark, zone).next?.startsWith(date)).toBe(true);
    }),
  );
});
