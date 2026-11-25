import { expect, test } from 'bun:test';
import { buildStatus } from './build-status';

interface ResetRow {
  readonly zone: string;
  readonly day: string;
  readonly month: string;
}

function setupTest() {
  return {
    readResets: (row: ResetRow) => {
      const status = buildStatus(
        {
          version: 2,
          lost: false,
          periods: {
            day: {
              start: row.day,
              resetsAt: null,
              dollars: 1,
              tokens: 10,
              limit: null,
              raise: null,
              trippedAt: null,
            },
            month: {
              start: row.month,
              resetsAt: null,
              dollars: 1,
              tokens: 10,
              limit: null,
              raise: null,
              trippedAt: null,
            },
          },
          sandboxes: {},
        },
        null,
        {
          zone: row.zone,
          caps: { day: { dollars: 10, tokens: 100 }, month: { dollars: 100, tokens: 1000 } },
          control: { listen: { hostname: '127.0.0.1', port: 1 }, tokenFile: '/token' },
          countBySandbox: false,
          override: null,
        },
        Date.parse('2026-12-01T00:00:00Z'),
      );

      return [status.periods.day.resetsAt, status.periods.month.resetsAt];
    },
  };
}

test.each([
  {
    zone: 'Europe/London',
    day: '2026-03-29',
    month: '2026-03-01',
    dayResets: '2026-03-29T23:00:00Z',
    monthResets: '2026-03-31T23:00:00Z',
  },
  {
    zone: 'Europe/London',
    day: '2026-10-25',
    month: '2026-10-01',
    dayResets: '2026-10-26T00:00:00Z',
    monthResets: '2026-11-01T00:00:00Z',
  },
  {
    zone: 'Asia/Tokyo',
    day: '2026-12-01',
    month: '2026-12-01',
    dayResets: '2026-12-01T15:00:00Z',
    monthResets: '2026-12-31T15:00:00Z',
  },
  {
    zone: 'Pacific/Apia',
    day: '2011-12-30',
    month: '2011-12-01',
    dayResets: '2011-12-31T10:00:00Z',
    monthResets: '2011-12-31T10:00:00Z',
  },
])('#buildStatus resets the day of $zone that starts $day at $dayResets', (row) => {
  const ctx = setupTest();

  expect(ctx.readResets(row)).toStrictEqual([row.dayResets, row.monthResets]);
});
