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
    firedTriggers: [],
    lastUnkeyedPushAtMs: 1000,
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
    firedTriggers: [],
    lastUnkeyedPushAtMs: null,
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

test('it keeps the trigger keys that push records name, and notes a push that names none', () => {
  const usage = collectMemoryUsage(
    [
      buildMockRecalledEntry({
        sequence: 10,
        itemIDs: ['item-a', 'item-b'],
        triggers: new Map([['item-a', ['key-1']]]),
      }),
      buildMockRecalledEntry({
        sequence: 11,
        itemIDs: ['item-a'],
        triggers: new Map([['item-a', ['key-2', 'key-1']]]),
      }),
    ],
    [],
  );

  expect([
    usage.items.get('item-a')?.firedTriggers,
    usage.items.get('item-a')?.lastUnkeyedPushAtMs,
    usage.items.get('item-b')?.firedTriggers,
    usage.items.get('item-b')?.lastUnkeyedPushAtMs,
  ]).toStrictEqual([['key-1', 'key-2'], null, [], 1000]);
});

test('it ends a call with no result at the next record of its thread that is no recalled record, so a later push counts as a push', () => {
  const usage = collectMemoryUsage(
    [buildMockRecalledEntry({ sequence: 30 })],
    [buildMockRecallCall({ sequence: 5, kind: 'ids', endSequence: 12 })],
  );

  expect(usage.items.get('item-a')).toMatchObject({
    searched: 0,
    pushed: 1,
    lastRecalledByIDAtMs: null,
  });
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

test('it reports the earliest record time over a million records', () => {
  const entries = Array.from({ length: 1_000_000 }, (_unused, index) =>
    buildMockRecalledEntry({
      sequence: index + 1,
      itemIDs: [],
      recordedAtMs: 9000 - (index % 100),
    }),
  );

  expect(collectMemoryUsage(entries, []).earliestAtMs).toBe(8901);
});
