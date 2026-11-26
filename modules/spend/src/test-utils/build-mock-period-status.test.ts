import { expect, test } from 'bun:test';
import { buildMockPeriodStatus } from './build-mock-period-status';

test('it builds a day with no spend, and lets a test override a field', () => {
  expect(buildMockPeriodStatus({ dollars: 5 })).toStrictEqual({
    start: '2026-11-13',
    resetsAt: '2026-11-14T00:00:00Z',
    dollars: 5,
    limit: 40,
    cap: 80,
    tripped: false,
    sinceMs: null,
  });
});
