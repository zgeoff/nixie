import { expect, test } from 'bun:test';
import { pickRaiseOffer } from './pick-raise-offer';

test.each([
  {
    name: 'a trip by dollars raises the dollars by half and keeps the rest',
    stop: { measure: 'dollars', used: { dollars: 61.2, tokens: 5, turns: 5 } },
    expected: { dollars: 90, tokens: 80_000_000, turns: 1000 },
  },
  {
    name: 'a trip by turns raises the turns by half',
    stop: { measure: 'turns', used: { dollars: 5, tokens: 5, turns: 1000 } },
    expected: { dollars: 60, tokens: 80_000_000, turns: 1500 },
  },
  {
    name: 'every tripped measure rises',
    stop: { measure: 'dollars', used: { dollars: 61, tokens: 80_000_001, turns: 1000 } },
    expected: { dollars: 90, tokens: 120_000_000, turns: 1500 },
  },
  {
    name: 'a raise stops at the cap',
    stop: {
      measure: 'dollars',
      used: { dollars: 100, tokens: 5, turns: 5 },
      limits: { dollars: 100, tokens: 80_000_000, turns: 1000 },
    },
    expected: { dollars: 120, tokens: 80_000_000, turns: 1000 },
  },
  {
    name: 'turns that the host raised above the cap, held at the cap',
    stop: {
      measure: 'dollars',
      used: { dollars: 61.2, tokens: 5, turns: 5 },
      limits: { dollars: 60, tokens: 80_000_000, turns: 3000 },
    },
    expected: { dollars: 90, tokens: 80_000_000, turns: 2000 },
  },
] as const)('it offers $name', (row) => {
  const offer = pickRaiseOffer({
    state: 'tripped',
    period: 'day',
    start: '2026-11-13',
    limit: 60,
    spent: 61.2,
    at: new Date('2026-11-13T16:42:07Z'),
    resetsAt: new Date('2026-11-14T00:00:00Z'),
    canRaise: true,
    limits: { dollars: 60, tokens: 80_000_000, turns: 1000 },
    cap: { dollars: 120, tokens: 160_000_000, turns: 2000 },
    ...row.stop,
  });

  expect(offer).toStrictEqual(row.expected);
});
