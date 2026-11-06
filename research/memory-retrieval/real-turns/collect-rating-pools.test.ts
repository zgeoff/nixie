import { expect, test } from 'bun:test';
import { collectRatingPools } from './collect-rating-pools.ts';

test('it pools the top places of a ranking setting, every item a served setting shows, and the logged items, once each', () => {
  const pools = collectRatingPools(
    [
      { name: 'ranking', kind: 'ranking' },
      { name: 'served', kind: 'served' },
    ],
    new Map([
      ['ranking', [{ caseID: 't4', ranking: { facts: ['item-a', 'item-b', 'item-c'], selves: ['item-s'] } }]],
      ['served', [{ caseID: 't4', ranking: { facts: ['item-b', 'item-d'], selves: ['item-e'] } }]],
    ]),
    [
      { caseID: 't4', logged: [{ itemID: 'item-f', version: 1 }] },
      { caseID: 't7', logged: [{ itemID: 'item-a', version: 2 }] },
    ],
    2,
  );

  expect(pools).toStrictEqual(
    new Map([
      ['t4', ['item-a', 'item-b', 'item-d', 'item-e', 'item-f']],
      ['t7', ['item-a']],
    ]),
  );
});
