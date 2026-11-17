import { expect, test } from 'bun:test';
import { buildSpendFacts } from './build-spend-facts';

test('it builds facts with no turns and no raise, and lets a test override a field', () => {
  const facts = buildSpendFacts({ turns: { day: 4, month: 9 } });

  expect([facts.turns, facts.raise, facts.status?.zone]).toStrictEqual([
    { day: 4, month: 9 },
    null,
    'UTC',
  ]);
});
