import { expect, test } from 'bun:test';
import { pickForgetProgress } from './pick-forget-progress';

test.each([
  [
    'an item still waits on its cleanup',
    ['item-a'],
    { deleted: [], pending: ['item-a'], forgottenSequence: null },
  ],
  ['an item no forget took', ['item-a'], { deleted: [], pending: [], forgottenSequence: null }],
  [
    'one of two items is deleted',
    ['item-a', 'item-b'],
    { deleted: ['item-a'], pending: [], forgottenSequence: 12 },
  ],
])('it picks deleting while %s', (_label, itemIDs, status) => {
  expect(pickForgetProgress(itemIDs, status)).toStrictEqual({ stage: 'deleting' });
});

test('it picks the newest forgotten record once every item is deleted', () => {
  const progress = pickForgetProgress(['item-a', 'item-b'], {
    deleted: ['item-a', 'item-b'],
    pending: [],
    forgottenSequence: 14,
  });

  expect(progress).toStrictEqual({ stage: 'forgotten', sequence: 14 });
});

test('it picks forgotten with no record for a forget of no item', () => {
  const progress = pickForgetProgress([], { deleted: [], pending: [], forgottenSequence: null });

  expect(progress).toStrictEqual({ stage: 'forgotten', sequence: null });
});
