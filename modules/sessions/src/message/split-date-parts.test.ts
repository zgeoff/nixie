import { expect, test } from 'bun:test';
import { splitDateParts } from './split-date-parts';

test('it splits a time into its parts in the zone given', () => {
  expect(splitDateParts(new Date('2026-10-14T03:05:00Z'), 'Australia/Sydney')).toStrictEqual({
    weekday: 'Wed',
    day: '14',
    month: 'Oct',
    year: '2026',
    hour: '14',
    minute: '05',
  });
});
