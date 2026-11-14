import { expect, test } from 'bun:test';
import { pickRetentionRemovals } from './pick-retention-removals';

function setupTest() {
  const dayMs = 86_400_000;
  const now = 100 * dayMs;

  return {
    now,
    buildRow: (
      name: string,
      ageDays: number,
      bytes: number,
      state: 'stored' | 'missing' = 'stored',
    ) => ({
      input_id: name,
      key_id: `key-${name}`,
      state,
      bytes,
      taken_at: now - ageDays * dayMs,
    }),
  };
}

test('it removes a row past the days, whatever its state', () => {
  const ctx = setupTest();

  const rows = [
    ctx.buildRow('old', 8, 1),
    ctx.buildRow('older-missing', 9, 1, 'missing'),
    ctx.buildRow('new', 6, 1),
  ];

  const removals = pickRetentionRemovals(rows, { days: 7, bytes: 1000 }, ctx.now);

  expect(removals.map((removal) => [removal.input.input_id, removal.cause])).toStrictEqual([
    ['old', 'retention_days'],
    ['older-missing', 'retention_days'],
  ]);
});

test('it removes the oldest stored rows until the bytes fit', () => {
  const ctx = setupTest();
  const rows = [ctx.buildRow('a', 3, 40), ctx.buildRow('b', 2, 40), ctx.buildRow('c', 1, 40)];
  const removals = pickRetentionRemovals(rows, { days: 7, bytes: 80 }, ctx.now);

  expect(removals.map((removal) => [removal.input.input_id, removal.cause])).toStrictEqual([
    ['a', 'retention_bytes'],
  ]);
});

test('it removes nothing from a store inside both limits', () => {
  const ctx = setupTest();

  expect(
    pickRetentionRemovals([ctx.buildRow('a', 1, 40)], { days: 7, bytes: 80 }, ctx.now),
  ).toStrictEqual([]);
});
