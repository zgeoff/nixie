import { expect, test } from 'bun:test';
import { periodOf } from './period-of';
import type { Period } from './types';

test.each<{
  label: string;
  now: string;
  zone: string;
  period: 'day' | 'week' | 'month';
  expected: Omit<Period, 'kind'>;
}>([
  {
    label: 'a day in UTC',
    now: '2026-10-16T09:30:00Z',
    zone: 'UTC',
    period: 'day',
    expected: {
      start: '2026-10-16',
      startsAtMs: Date.parse('2026-10-16T00:00:00Z'),
      endsAtMs: Date.parse('2026-10-17T00:00:00Z'),
    },
  },
  {
    label: 'a Friday, whose week started on Monday',
    now: '2026-10-16T09:30:00Z',
    zone: 'UTC',
    period: 'week',
    expected: {
      start: '2026-10-12',
      startsAtMs: Date.parse('2026-10-12T00:00:00Z'),
      endsAtMs: Date.parse('2026-10-19T00:00:00Z'),
    },
  },
  {
    label: 'a Monday, which starts its own week',
    now: '2026-10-12T00:00:00Z',
    zone: 'UTC',
    period: 'week',
    expected: {
      start: '2026-10-12',
      startsAtMs: Date.parse('2026-10-12T00:00:00Z'),
      endsAtMs: Date.parse('2026-10-19T00:00:00Z'),
    },
  },
  {
    label: 'a Sunday, which ends the week before it',
    now: '2026-10-18T23:59:59Z',
    zone: 'UTC',
    period: 'week',
    expected: {
      start: '2026-10-12',
      startsAtMs: Date.parse('2026-10-12T00:00:00Z'),
      endsAtMs: Date.parse('2026-10-19T00:00:00Z'),
    },
  },
  {
    label: 'a month in December, which resets in the next year',
    now: '2026-12-31T23:00:00Z',
    zone: 'UTC',
    period: 'month',
    expected: {
      start: '2026-12-01',
      startsAtMs: Date.parse('2026-12-01T00:00:00Z'),
      endsAtMs: Date.parse('2027-01-01T00:00:00Z'),
    },
  },
  {
    label: 'an instant that is still the day before in New York',
    now: '2026-10-16T02:00:00Z',
    zone: 'America/New_York',
    period: 'day',
    expected: {
      start: '2026-10-15',
      startsAtMs: Date.parse('2026-10-15T04:00:00Z'),
      endsAtMs: Date.parse('2026-10-16T04:00:00Z'),
    },
  },
  {
    label: 'the day that clocks go forward in London, which holds 23 hours',
    now: '2026-03-29T12:00:00Z',
    zone: 'Europe/London',
    period: 'day',
    expected: {
      start: '2026-03-29',
      startsAtMs: Date.parse('2026-03-29T00:00:00Z'),
      endsAtMs: Date.parse('2026-03-29T23:00:00Z'),
    },
  },
  {
    label: 'the day that clocks go back in London, which holds 25 hours',
    now: '2026-10-25T12:00:00Z',
    zone: 'Europe/London',
    period: 'day',
    expected: {
      start: '2026-10-25',
      startsAtMs: Date.parse('2026-10-24T23:00:00Z'),
      endsAtMs: Date.parse('2026-10-26T00:00:00Z'),
    },
  },
  {
    label: 'a week that holds the change in London, which resets an hour sooner',
    now: '2026-03-27T12:00:00Z',
    zone: 'Europe/London',
    period: 'week',
    expected: {
      start: '2026-03-23',
      startsAtMs: Date.parse('2026-03-23T00:00:00Z'),
      endsAtMs: Date.parse('2026-03-29T23:00:00Z'),
    },
  },
  {
    label: 'a month that holds the change in London',
    now: '2026-10-31T12:00:00Z',
    zone: 'Europe/London',
    period: 'month',
    expected: {
      start: '2026-10-01',
      startsAtMs: Date.parse('2026-09-30T23:00:00Z'),
      endsAtMs: Date.parse('2026-11-01T00:00:00Z'),
    },
  },
])('it builds $label', (row) => {
  expect(periodOf(row.period, Date.parse(row.now), row.zone)).toStrictEqual({
    kind: row.period,
    ...row.expected,
  });
});

test('it builds a period that never resets with no start and no end', () => {
  expect(periodOf('none', Date.parse('2026-10-16T09:30:00Z'), 'UTC')).toStrictEqual({
    kind: 'none',
    start: '',
    startsAtMs: 0,
    endsAtMs: null,
  });
});

test('it starts a day in Auckland on the date that the instant has there', () => {
  expect(periodOf('day', Date.parse('2026-11-23T23:30:00Z'), 'Pacific/Auckland').start).toBe(
    '2026-11-24',
  );
});
