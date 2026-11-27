import { expect, test } from 'bun:test';
import { formatSessionEventTime } from './format-session-event-time';

test('#formatSessionEventTime says no event yet before the first event', () => {
  expect(formatSessionEventTime(null)).toBe('No event yet');
});

test('#formatSessionEventTime gives the minute of the event it is given', () => {
  const first = formatSessionEventTime(new Date('2027-03-09T10:00:00.000Z'));
  const second = formatSessionEventTime(new Date('2027-03-09T10:05:00.000Z'));

  expect(first).not.toBe(second);
});
