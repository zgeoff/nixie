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
    dayResets: '2026-03-30T00:00:00Z',
    monthResets: '2026-04-01T00:00:00Z',
  },
  {
    zone: 'Asia/Tokyo',
    day: '2026-12-01',
    month: '2026-12-01',
    dayResets: '2026-12-02T00:00:00Z',
    monthResets: '2027-01-01T00:00:00Z',
  },
])('#buildStatus ends a count that stamps no end at the UTC end, in $zone', (row) => {
  const ctx = setupTest();

  expect(ctx.readResets(row)).toStrictEqual([row.dayResets, row.monthResets]);
});
