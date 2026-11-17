import { expect, test } from 'bun:test';
import { checkReminderTrigger } from './check-reminder-trigger';

test('it reads an at without an offset in the owner zone', () => {
  const checked = checkReminderTrigger(
    { at: '2027-03-10T08:00:00' },
    { now: 1_804_550_400_000, minGapMinutes: 15, ownerZone: 'Europe/Paris' },
  );

  expect(checked).toStrictEqual({ status: 'ok', trigger: { at: '2027-03-10T08:00:00+01:00' } });
});

test('it fills the defaults of a schedule', () => {
  const checked = checkReminderTrigger(
    { schedule: { every: 'day', at: '08:00' } },
    { now: 1_804_550_400_000, minGapMinutes: 15, ownerZone: 'UTC' },
  );

  expect(checked).toStrictEqual({
    status: 'ok',
    trigger: { schedule: { every: 'day', at: '08:00', zone: 'owner', catchUp: 'once' } },
  });
});

test('it refuses a recurring schedule under the minimum gap with a sentence that names the limit', () => {
  const checked = checkReminderTrigger(
    { schedule: { every: { minutes: 5 } } },
    { now: 1_804_550_400_000, minGapMinutes: 15, ownerZone: 'UTC' },
  );

  expect(checked).toStrictEqual({
    status: 'refused',
    code: 'MIN_GAP',
    sentence: 'A recurring reminder fires at most every 15 minutes (reminders.min_gap_minutes).',
  });
});

test('it accepts a recurring schedule at the minimum gap', () => {
  const checked = checkReminderTrigger(
    { schedule: { every: { minutes: 15 } } },
    { now: 1_804_550_400_000, minGapMinutes: 15, ownerZone: 'UTC' },
  );

  expect(checked.status).toBe('ok');
});

test('it refuses a time that has passed', () => {
  const checked = checkReminderTrigger(
    { at: '2027-03-08T08:00:00Z' },
    { now: 1_804_550_400_000, minGapMinutes: 15, ownerZone: 'UTC' },
  );

  expect(checked).toMatchObject({ status: 'refused', code: 'PAST' });
});
