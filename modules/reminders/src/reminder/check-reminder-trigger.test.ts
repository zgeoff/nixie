import { expect, test } from 'bun:test';
import { checkReminderTrigger } from './check-reminder-trigger';

test('it reads an at without an offset in the owner zone', () => {
  const checked = checkReminderTrigger(
    { at: '2027-03-10T08:00:00' },
    { now: 1_804_550_400_000, minGapMinutes: 15, ownerZone: 'Europe/Paris' },
  );

  expect(checked).toStrictEqual({ status: 'ok', trigger: { at: '2027-03-10T08:00:00+01:00' } });
});

test('it fills the defaults and the start date of a schedule', () => {
  const checked = checkReminderTrigger(
    { schedule: { repeat: { frequency: 'daily', at: ['08:00'] } } },
    { now: Date.parse('2027-03-09T00:00:00Z'), minGapMinutes: 15, ownerZone: 'UTC' },
  );

  expect(checked).toStrictEqual({
    status: 'ok',
    trigger: {
      schedule: {
        repeat: { frequency: 'daily', at: ['08:00'], starts: '2027-03-09' },
        zone: 'owner',
        catchUp: 'once',
      },
    },
  });
});

test('it refuses a recurring schedule under the minimum gap with the field and a fix', () => {
  const checked = checkReminderTrigger(
    { schedule: { repeat: { frequency: 'minutely', interval: 5, starts: '2027-03-09' } } },
    { now: 1_804_550_400_000, minGapMinutes: 15, ownerZone: 'UTC' },
  );

  expect(checked).toStrictEqual({
    status: 'refused',
    code: 'MIN_GAP',
    path: 'trigger.schedule.repeat',
    sentence:
      'A schedule fires at most every 15 minutes, and 2 of its next fires lie closer than that. Widen the interval, or drop a time from at.',
  });
});

test('it accepts a recurring schedule at the minimum gap', () => {
  const checked = checkReminderTrigger(
    { schedule: { repeat: { frequency: 'minutely', interval: 15, starts: '2027-03-09' } } },
    { now: 1_804_550_400_000, minGapMinutes: 15, ownerZone: 'UTC' },
  );

  expect(checked.status).toBe('ok');
});

test('it refuses a schedule that mixes fields, with the path of the field', () => {
  const checked = checkReminderTrigger(
    { schedule: { repeat: { frequency: 'hourly', at: ['09:00'] } } },
    { now: 1_804_550_400_000, minGapMinutes: 15, ownerZone: 'UTC' },
  );

  expect(checked).toMatchObject({
    status: 'refused',
    code: 'AT_NOT_ALLOWED',
    path: 'trigger.schedule.repeat.at',
  });
});

test('it refuses a time that has passed', () => {
  const checked = checkReminderTrigger(
    { at: '2027-03-08T08:00:00Z' },
    { now: 1_804_550_400_000, minGapMinutes: 15, ownerZone: 'UTC' },
  );

  expect(checked).toMatchObject({ status: 'refused', code: 'PAST' });
});
