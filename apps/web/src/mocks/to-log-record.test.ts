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
