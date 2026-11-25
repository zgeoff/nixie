import { expect, test } from 'bun:test';
import { readRecordEvents } from './read-record-events';

function setupTest() {
  const events = [
    { kind: 'opened' as const },
    {
      kind: 'record' as const,
      record: {
        kind: 'owner_message',
        recordedAt: new Date(0),
        sequence: 4,
        thread: 'conversation',
      },
    },
    { kind: 'changed' as const, topics: ['tasks' as const] },
  ];

  return {
    events,
    stream: {
      next: () => {
        const value = events.shift();

        if (value === undefined) {
          return Promise.resolve({ done: true as const, value: undefined });
        }

        return Promise.resolve({ done: false as const, value });
      },
    },
  };
}

test('it reads the record events and skips the others', async () => {
  const ctx = setupTest();

  const records = await readRecordEvents<(typeof ctx.events)[number]>(ctx.stream, 1);

  expect(records.map((event) => event.record.sequence)).toStrictEqual([4]);
});

test('it fails when the stream ends before the count', () => {
  const ctx = setupTest();

  expect(readRecordEvents(ctx.stream, 2)).rejects.toThrow('ended after 1 of 2');
});
