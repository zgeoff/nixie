import { expect, test } from 'bun:test';
import { buildMockPeriodStatus } from '../test-utils';
import { pickRaiseRefusal } from './pick-raise-refusal';

test.each([
  {
    name: 'for another day',
    request: { start: '2026-11-12' },
    expected: { error: 'period_ended' },
  },
  {
    name: 'above the dollar cap',
    request: { dollars: 120.01 },
    expected: { error: 'above_cap', cap: { dollars: 120, tokens: 160_000_000, turns: 2000 } },
  },
  {
    name: 'above the token cap',
    request: { tokens: 160_000_001 },
    expected: { error: 'above_cap', cap: { dollars: 120, tokens: 160_000_000, turns: 2000 } },
  },
  {
    name: 'above the turn cap',
    request: { turns: 2001 },
    expected: { error: 'above_cap', cap: { dollars: 120, tokens: 160_000_000, turns: 2000 } },
  },
  {
    name: 'at every cap',
    request: { dollars: 120, tokens: 160_000_000, turns: 2000 },
    expected: null,
  },
])('it picks a raise $name', (row) => {
  const refusal = pickRaiseRefusal(
    buildMockPeriodStatus(),
    { dayTurns: 1000, dayTurnCap: 2000, monthTurns: 20_000 },
    { start: '2026-11-13', dollars: 90, tokens: 120_000_000, turns: 1500, ...row.request },
  );

  expect(refusal).toStrictEqual(row.expected);
});
