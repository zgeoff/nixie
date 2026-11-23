import { expect, test } from 'bun:test';
import { buildMockRecallCall } from '../test-utils/build-mock-recall-call';
import { buildMockRecalledEntry } from '../test-utils/build-mock-recalled-entry';
import { collectMemoryUsage } from './collect-memory-usage';

test('it counts a record outside every recall call as a push', () => {
  const usage = collectMemoryUsage([buildMockRecalledEntry()], []);

  expect(usage.items.get('item-a')).toStrictEqual({
    searched: 0,
    pushed: 1,
    lastSurfacedAtMs: 1000,
    lastRecalledByIDAtMs: null,
  });
});

test('it counts a record with a search mode inside a recall call as a search', () => {
  const usage = collectMemoryUsage([buildMockRecalledEntry()], [buildMockRecallCall()]);

  expect(usage.items.get('item-a')).toMatchObject({ searched: 1, pushed: 0 });
});

test('it counts a record with no search mode inside an ID call as a recall by ID, not a surface', () => {
  const usage = collectMemoryUsage(
    [buildMockRecalledEntry({ hasSearchMode: false, recordedAtMs: 4000 })],
    [buildMockRecallCall({ kind: 'ids' })],
  );

  expect(usage.items.get('item-a')).toStrictEqual({
    searched: 0,
    pushed: 0,
    lastSurfacedAtMs: null,
    lastRecalledByIDAtMs: 4000,
  });
});

test.each([
  ['a list call', { hasSearchMode: false }, [buildMockRecallCall()]],
  ['a turn note', { hasSearchMode: false, isTurnNote: true }, []],
  ['a record with no search mode and no call', { hasSearchMode: false }, []],
])('it counts nothing for %s', (_name, overrides, calls) => {
  const usage = collectMemoryUsage([buildMockRecalledEntry(overrides)], calls);

  expect(usage.items.size).toBe(0);
});

test('it ignores a call on another thread when it places a record', () => {
  const usage = collectMemoryUsage(
    [buildMockRecalledEntry()],
    [buildMockRecallCall({ thread: 'task-1' })],
  );

  expect(usage.items.get('item-a')).toMatchObject({ searched: 0, pushed: 1 });
});

test('it counts an item once per record and keeps the newest time', () => {
  const usage = collectMemoryUsage(
    [
      buildMockRecalledEntry({ sequence: 10, itemIDs: ['item-a', 'item-a'], recordedAtMs: 3000 }),
      buildMockRecalledEntry({ sequence: 11, itemIDs: ['item-a'], recordedAtMs: 2000 }),
    ],
    [],
  );

  expect(usage.items.get('item-a')).toMatchObject({ pushed: 2, lastSurfacedAtMs: 3000 });
});

test('it reports the earliest record time over every record, whether or not it counts', () => {
  const usage = collectMemoryUsage(
    [
      buildMockRecalledEntry({ sequence: 11, recordedAtMs: 5000 }),
      buildMockRecalledEntry({ sequence: 12, recordedAtMs: 800, isTurnNote: true }),
    ],
    [],
  );

  expect(usage.earliestAtMs).toBe(800);
});

test('it reports no earliest time with no record', () => {
  expect(collectMemoryUsage([], []).earliestAtMs).toBeNull();
});
