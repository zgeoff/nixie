import { expect, test } from 'bun:test';
import { formatEventTime } from './format-event-time';

test.each([
  {
    title: 'a time in the zone of the owner',
    value: '2026-11-18T14:00:00+11:00',
    zone: 'Australia/Sydney',
    expected: 'Wed 18 Nov 2026, 14:00 Sydney',
  },
  {
    title: 'a time of another offset moved to the owner zone',
    value: '2026-11-18T03:00:00Z',
    zone: 'Australia/Sydney',
    expected: 'Wed 18 Nov 2026, 14:00 Sydney',
  },
  {
    title: 'an all-day date',
    value: '2026-11-20',
    zone: 'Australia/Sydney',
    expected: 'Fri 20 Nov 2026 (all day)',
  },
  { title: 'text that is no time', value: 'soon', zone: 'UTC', expected: 'soon' },
])('#formatEventTime shows $title', (row) => {
  expect(formatEventTime(row.value, row.zone)).toBe(row.expected);
});
