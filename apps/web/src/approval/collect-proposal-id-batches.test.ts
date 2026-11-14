import { expect, test } from 'bun:test';
import { collectProposalIDBatches } from './collect-proposal-id-batches';

test.each([
  { count: 0, sizes: [] },
  { count: 100, sizes: [100] },
  { count: 101, sizes: [100, 1] },
  { count: 250, sizes: [100, 100, 50] },
])('it collects $count IDs into batches of $sizes', (row) => {
  const ids = Array.from({ length: row.count }, (_, index) => `proposal-${String(index)}`);
  const batches = collectProposalIDBatches(ids);

  expect(batches.map((batch) => batch.length)).toStrictEqual([...row.sizes]);
});

test('it keeps the order of the IDs across batches', () => {
  const ids = Array.from({ length: 101 }, (_, index) => `proposal-${String(index)}`);

  expect(collectProposalIDBatches(ids).flat()).toStrictEqual(ids);
});
