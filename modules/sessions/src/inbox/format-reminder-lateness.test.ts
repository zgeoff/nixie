import { expect, test } from 'bun:test';
import { formatReminderLateness } from './format-reminder-lateness';

function setupTest() {
  return {
    fire: { scheduledFor: '2027-03-09T03:00:00.000Z', firedAt: '2027-03-09T03:00:01.000Z' },
  };
}

test.each([
  ['2027-03-09T03:00:30.000Z', null],
  ['2027-03-09T03:01:00.000Z', null],
  ['2027-03-09T03:01:01.000Z', 'fired 1 min late'],
  ['2027-03-09T04:39:20.000Z', 'fired 1 h 39 min late'],
  ['2027-03-09T05:00:00.000Z', 'fired 2 h late'],
  ['2027-03-10T07:00:00.000Z', 'fired 1 day 4 h late'],
])('it formats a reminder delivered at %s as %p', (deliveredAt, expected) => {
  const ctx = setupTest();

  expect(formatReminderLateness(ctx.fire, Date.parse(deliveredAt))).toBe(expected);
});

test('it counts a fire later than the delivery clock as the arrival', () => {
  const ctx = setupTest();
  const lateFire = { ...ctx.fire, firedAt: '2027-03-09T04:39:00.000Z' };

  expect(formatReminderLateness(lateFire, Date.parse('2027-03-09T03:00:00.000Z'))).toBe(
    'fired 1 h 39 min late',
  );
});
