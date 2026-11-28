import { expect, test } from 'bun:test';
import { pickTextStatus } from './pick-text-status';

function setupTest() {
  return {
    coverage: {
      keyIDs: new Set(['key-a']),
      families: ['item-1'],
      threads: new Set(['gone-thread']),
    },
  };
}

test.each([
  { name: 'an erasure named', keyID: 'key-a', thread: null, expected: 'shredded' },
  { name: 'in a forgotten family', keyID: 'item-1/2', thread: null, expected: 'shredded' },
  { name: 'of a forgotten thread', keyID: 'key-z', thread: 'gone-thread', expected: 'shredded' },
  { name: 'no erasure named', keyID: 'key-z', thread: 'other', expected: 'expired' },
  { name: 'only sharing a family prefix', keyID: 'item-10', thread: null, expected: 'expired' },
])('it reports $expected for a missing key $name', (row) => {
  const ctx = setupTest();

  const status = pickTextStatus(
    { erasable: { status: 'shredded' }, keyID: row.keyID, thread: row.thread },
    ctx.coverage,
  );

  expect(status).toBe(row.expected);
});

test.each(['none', 'unreadable'] as const)('it keeps the status %s as it is', (status) => {
  const ctx = setupTest();

  const picked = pickTextStatus(
    { erasable: { status }, keyID: 'key-a', thread: null },
    ctx.coverage,
  );

  expect(picked).toBe(status);
});
