import { expect, test } from 'bun:test';
import { buildMockPeriodStatus } from './build-mock-period-status';

test('it builds a day with no spend, and lets a test override a field', () => {
  expect(buildMockPeriodStatus({ spent: { dollars: 5, tokens: 1 } })).toStrictEqual({
    start: '2026-11-13',
    resetsAt: '2026-11-14T00:00:00Z',
    spent: { dollars: 5, tokens: 1 },
    limit: { dollars: 60, tokens: 80_000_000 },
    cap: { dollars: 120, tokens: 160_000_000 },
  });
});
