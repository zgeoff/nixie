import { expect, test } from 'bun:test';
import { pickChargeRefusal } from './pick-charge-refusal';

test('it picks no refusal when every budget has room for the whole amount', () => {
  expect(
    pickChargeRefusal(
      [
        {
          limit: { id: 'a-day', counts: 'spend', limitMicros: 5_000_000, period: 'day' },
          spentMicros: 4_000_000,
          bounds: {
            start: '2026-10-16',
            resetsOn: '2026-10-17',
            startMs: Date.parse('2026-10-16T00:00:00Z'),
            resetsAtMs: Date.parse('2026-10-17T00:00:00Z'),
          },
        },
      ],
      1_000_000,
    ),
  ).toBeNull();
});

test('it refuses a charge that the last of a budget cannot hold, and names that budget', () => {
  expect(
    pickChargeRefusal(
      [
        {
          limit: { id: 'a-day', counts: 'spend', limitMicros: 5_000_000, period: 'day' },
          spentMicros: 1_000_000,
          bounds: {
            start: '2026-10-16',
            resetsOn: '2026-10-17',
            startMs: Date.parse('2026-10-16T00:00:00Z'),
            resetsAtMs: Date.parse('2026-10-17T00:00:00Z'),
          },
        },
        {
          limit: { id: 'a-month', counts: 'spend', limitMicros: 50_000_000, period: 'month' },
          spentMicros: 49_500_000,
          bounds: {
            start: '2026-10-16',
            resetsOn: '2026-10-17',
            startMs: Date.parse('2026-10-16T00:00:00Z'),
            resetsAtMs: Date.parse('2026-10-17T00:00:00Z'),
          },
        },
      ],
      1_000_000,
    ),
  ).toStrictEqual({
    error: 'budget_reached',
    budgetID: 'a-month',
    period: 'month',
    spentMicros: 49_500_000,
    limitMicros: 50_000_000,
    resetsAt: Date.parse('2026-10-17T00:00:00Z'),
    resetsOn: '2026-10-17',
  });
});
