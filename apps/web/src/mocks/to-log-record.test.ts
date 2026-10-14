import { expect, test } from 'bun:test';
import { store } from './store';
import { toLogRecord } from './to-log-record';

test('it copies a message record with its text and spans', async () => {
  const record = await store.records.create({
    kind: 'owner_message',
    message: { spans: [{ end: 5, source: 'typed', start: 0 }], text: 'hello' },
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 1,
    thread: 'conversation',
  });

  expect(toLogRecord(record)).toStrictEqual({
    kind: 'owner_message',
    message: { spans: [{ end: 5, source: 'typed', start: 0 }], text: 'hello' },
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 1,
    thread: 'conversation',
  });
});

test('it copies a turn end with its context', async () => {
  const record = await store.records.create({
    context: { size: 41_000, window: 400_000 },
    kind: 'model.turn_ended',
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 3,
    thread: 'conversation',
  });

  expect(toLogRecord(record)).toStrictEqual({
    context: { size: 41_000, window: 400_000 },
    kind: 'model.turn_ended',
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 3,
    thread: 'conversation',
  });
});

test('it copies a compaction with its counts before and after', async () => {
  const record = await store.records.create({
    compaction: { postTokens: 42_000, preTokens: 384_000, trigger: 'auto' },
    kind: 'model.compacted',
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 4,
    thread: 'conversation',
  });

  expect(toLogRecord(record)).toStrictEqual({
    compaction: { postTokens: 42_000, preTokens: 384_000, trigger: 'auto' },
    kind: 'model.compacted',
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 4,
    thread: 'conversation',
  });
});

test('it leaves the after count out of a compaction that has none', async () => {
  const record = await store.records.create({
    compaction: { preTokens: 384_000, trigger: 'manual' },
    kind: 'model.compacted',
  });

  expect(toLogRecord(record).compaction).toStrictEqual({ preTokens: 384_000, trigger: 'manual' });
});

test('it copies a recall with each score, and leaves the score out where none exists', async () => {
  const record = await store.records.create({
    kind: 'memory.recalled',
    recall: {
      items: [
        { itemID: 'item-a', score: 0.61, version: 2 },
        { itemID: 'item-b', version: 1 },
      ],
    },
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 2,
    thread: 'conversation',
  });

  expect(toLogRecord(record)).toStrictEqual({
    kind: 'memory.recalled',
    recall: {
      items: [
        { itemID: 'item-a', score: 0.61, version: 2 },
        { itemID: 'item-b', version: 1 },
      ],
    },
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 2,
    thread: 'conversation',
  });
});

test("it copies a rating with each verdict, and leaves the agent's name out where none exists", async () => {
  const named = await store.records.create({
    kind: 'memory.rated',
    rating: {
      items: [{ hasNote: true, itemID: 'item-a', verdict: 'noise', version: 2 }],
      ratedBy: 'Pip',
      recalledSequence: 2,
    },
  });
  const unnamed = await store.records.create({
    kind: 'memory.rated',
    rating: {
      items: [{ hasNote: false, itemID: 'item-b', verdict: 'helpful', version: 1 }],
      recalledSequence: 2,
    },
  });

  expect(toLogRecord(named).rating).toStrictEqual({
    items: [{ hasNote: true, itemID: 'item-a', verdict: 'noise', version: 2 }],
    ratedBy: 'Pip',
    recalledSequence: 2,
  });
  expect(toLogRecord(unnamed).rating).toStrictEqual({
    items: [{ hasNote: false, itemID: 'item-b', verdict: 'helpful', version: 1 }],
    recalledSequence: 2,
  });
});
