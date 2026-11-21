import { expect, test } from 'bun:test';
import { scheduleSchema } from './schedule-schema';
import { triggerSchema } from './trigger-schema';

test('it fills the zone and the catch-up default', () => {
  expect(scheduleSchema.parse({ every: 'day', at: '08:30' })).toStrictEqual({
    every: 'day',
    at: '08:30',
    zone: 'owner',
    catchUp: 'once',
  });
});

test.each([
  { every: 'day', at: '08:30' },
  { every: 'week', on: 'fri', at: '23:59' },
  { every: 'day', window: { from: '09:00', until: '17:00' }, idleMinutes: 30 },
  { every: 'hour' },
  { every: { minutes: 5 } },
  { every: { minutes: 1440 } },
  { every: 'day', at: '07:00', zone: 'Australia/Sydney', catchUp: 'skip' },
])('it accepts the schedule %j', (schedule) => {
  expect(scheduleSchema.safeParse(schedule).success).toBe(true);
});

test.each([
  ['an every of month', { every: 'month', at: '08:00' }],
  ['minutes below 5', { every: { minutes: 4 } }],
  ['minutes above 1440', { every: { minutes: 1441 } }],
  ['minutes that are not whole', { every: { minutes: 7.5 } }],
  ['an at of 24:00', { every: 'day', at: '24:00' }],
  ['an at without a leading zero', { every: 'day', at: '8:00' }],
  ['a day with neither at nor window', { every: 'day' }],
  ['a week with neither at nor window', { every: 'week', on: 'mon' }],
  [
    'a day with both at and window',
    { every: 'day', at: '08:00', window: { from: '09:00', until: '10:00' } },
  ],
  ['an hour with at', { every: 'hour', at: '08:00' }],
  ['minutes with at', { every: { minutes: 10 }, at: '08:00' }],
  ['an hour with window', { every: 'hour', window: { from: '09:00', until: '10:00' } }],
  ['minutes with window', { every: { minutes: 10 }, window: { from: '09:00', until: '10:00' } }],
  ['a week without on', { every: 'week', at: '08:00' }],
  ['a day with on', { every: 'day', at: '08:00', on: 'mon' }],
  ['an on that is no weekday', { every: 'week', at: '08:00', on: 'monday' }],
  ['a window with a bad time', { every: 'day', window: { from: '9am', until: '10:00' } }],
  ['idleMinutes without window', { every: 'day', at: '08:00', idleMinutes: 10 }],
  ['idleMinutes of 0', { every: 'day', window: { from: '09:00', until: '10:00' }, idleMinutes: 0 }],
  [
    'idleMinutes above 720',
    { every: 'day', window: { from: '09:00', until: '10:00' }, idleMinutes: 721 },
  ],
  ['a zone that is not a zone', { every: 'day', at: '08:00', zone: 'Mars/Olympus' }],
  ['a catchUp that is neither once nor skip', { every: 'day', at: '08:00', catchUp: 'all' }],
  ['a key the schedule does not know', { every: 'day', at: '08:00', cron: '* * * * *' }],
])('it refuses %s', (_name, schedule) => {
  expect(scheduleSchema.safeParse(schedule).success).toBe(false);
});

test('it fills the repeat defaults', () => {
  expect(scheduleSchema.parse({ repeat: { frequency: 'daily', at: ['08:30'] } })).toStrictEqual({
    repeat: { frequency: 'daily', at: ['08:30'] },
    zone: 'owner',
    catchUp: 'once',
  });
});

test.each([
  { repeat: { frequency: 'minutely', interval: 30 } },
  { repeat: { frequency: 'hourly' }, hours: { from: '09:00', until: '17:00' } },
  { repeat: { frequency: 'weekly', byDay: ['mon', 'fri'], at: ['08:00'] } },
  { repeat: { frequency: 'monthly', byDay: [{ day: 'fri', nth: -1 }], at: ['18:00'] } },
  { repeat: { frequency: 'monthly', byMonthDay: [1, -1], at: ['09:00'] } },
  { repeat: { frequency: 'yearly', byMonth: [3, 9], byMonthDay: [15], at: ['09:00'] } },
  { repeat: { frequency: 'weekly', interval: 2, starts: '2027-03-01', at: ['08:00'] } },
  { repeat: { frequency: 'daily', at: ['08:00'] }, zone: 'Australia/Sydney', catchUp: 'skip' },
])('it accepts the repeat schedule %j', (schedule) => {
  expect(scheduleSchema.safeParse(schedule).success).toBe(true);
});

test.each([
  ['a frequency of fortnightly', { repeat: { frequency: 'fortnightly' } }],
  ['an interval of 0', { repeat: { frequency: 'daily', interval: 0, at: ['08:00'] } }],
  ['an interval above 1000', { repeat: { frequency: 'daily', interval: 1001, at: ['08:00'] } }],
  ['an interval that is not whole', { repeat: { frequency: 'daily', interval: 1.5 } }],
  [
    'an nth of 0',
    { repeat: { frequency: 'monthly', byDay: [{ day: 'fri', nth: 0 }], at: ['08:00'] } },
  ],
  [
    'an nth of 6',
    { repeat: { frequency: 'monthly', byDay: [{ day: 'fri', nth: 6 }], at: ['08:00'] } },
  ],
  [
    'an nth of -6',
    { repeat: { frequency: 'monthly', byDay: [{ day: 'fri', nth: -6 }], at: ['08:00'] } },
  ],
  ['a byDay that is empty', { repeat: { frequency: 'weekly', byDay: [], at: ['08:00'] } }],
  ['a byDay of monday', { repeat: { frequency: 'weekly', byDay: ['monday'], at: ['08:00'] } }],
  ['a byMonthDay of 0', { repeat: { frequency: 'monthly', byMonthDay: [0], at: ['08:00'] } }],
  ['a byMonthDay of 32', { repeat: { frequency: 'monthly', byMonthDay: [32], at: ['08:00'] } }],
  ['a byMonthDay of -32', { repeat: { frequency: 'monthly', byMonthDay: [-32], at: ['08:00'] } }],
  [
    'a byMonthDay that is empty',
    { repeat: { frequency: 'monthly', byMonthDay: [], at: ['08:00'] } },
  ],
  ['a byMonth of 0', { repeat: { frequency: 'yearly', byMonth: [0], at: ['08:00'] } }],
  ['a byMonth of 13', { repeat: { frequency: 'yearly', byMonth: [13], at: ['08:00'] } }],
  ['an at that is empty', { repeat: { frequency: 'daily', at: [] } }],
  ['an at of 24:00', { repeat: { frequency: 'daily', at: ['24:00'] } }],
  ['a starts that is no date', { repeat: { frequency: 'daily', starts: 'soon', at: ['08:00'] } }],
  ['a repeat key it does not know', { repeat: { frequency: 'daily', cron: '* * * * *' } }],
  ['a zone that is not a zone', { repeat: { frequency: 'daily', at: ['08:00'] }, zone: 'Mars/X' }],
  ['a repeat beside the old every', { repeat: { frequency: 'daily' }, every: 'day', at: '08:00' }],
])('it refuses the repeat schedule with %s', (_name, schedule) => {
  expect(scheduleSchema.safeParse(schedule).success).toBe(false);
});

test('it parses an old-shape schedule through the union as the old shape', () => {
  expect(scheduleSchema.parse({ every: 'week', on: 'fri', at: '23:59' })).toStrictEqual({
    every: 'week',
    on: 'fri',
    at: '23:59',
    zone: 'owner',
    catchUp: 'once',
  });
});

test.each(['2027-03-09T14:00:00+11:00', '2027-03-09T14:00:00Z'])(
  'it accepts the trigger at %s',
  (at) => {
    expect(triggerSchema.safeParse({ at }).success).toBe(true);
  },
);

test.each([
  ['an at with no offset', { at: '2027-03-09T14:00:00' }],
  ['an at that is no date-time', { at: 'tomorrow' }],
  ['a trigger with both keys', { at: '2027-03-09T14:00:00Z', schedule: { every: 'hour' } }],
])('it refuses %s', (_name, trigger) => {
  expect(triggerSchema.safeParse(trigger).success).toBe(false);
});
