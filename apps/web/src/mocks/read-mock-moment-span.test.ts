import { expect, test } from 'bun:test';
import { readMockMomentSpan } from './read-mock-moment-span';
import { store } from './store';

test('it reads a span of more than 100 records a page at a time', async () => {
  await Promise.all(
    Array.from({ length: 101 }, (_, index) =>
      store.records.create({
        sequence: index + 1,
        kind: 'owner_message',
        message: { text: `take ${String(index + 1)}` },
      }),
    ),
  );

  const moment = await store.moments.create({ firstSequence: 1, lastSequence: 101 });

  const page = readMockMomentSpan(moment.momentID);
  const rest = readMockMomentSpan(moment.momentID, 100);

  expect(page?.records).toHaveLength(100);
  expect(page?.next).toBe(100);
  expect(rest?.records.map((record) => record.text)).toStrictEqual(['take 101']);
  expect(rest?.next).toBeNull();
});

test("it reads the span's records of the moment's thread in order, with a forgotten message as a gap", async () => {
  await store.records.create({ sequence: 1, kind: 'owner_message', message: { text: 'before' } });
  await store.records.create({ sequence: 2, kind: 'owner_message' });
  await store.records.create({ sequence: 3, kind: 'owner_message', thread: 'morning-reading' });

  await store.records.create({
    sequence: 4,
    kind: 'tool_called',
    toolCall: { callID: 'call-1', tool: 'web_fetch' },
  });

  await store.records.create({ sequence: 5, kind: 'model.reply', message: { text: 'Try oil.' } });

  const moment = await store.moments.create({ firstSequence: 2, lastSequence: 5 });

  const span = readMockMomentSpan(moment.momentID);

  expect(
    span?.records.map((record) => [record.sequence, record.isGap, record.text, record.tool]),
  ).toStrictEqual([
    [2, true, null, null],
    [4, false, null, 'web_fetch'],
    [5, false, 'Try oil.', null],
  ]);
});

test('it reads no span of a moment that was destroyed', async () => {
  const moment = await store.moments.create({ state: 'destroyed' });

  expect(readMockMomentSpan(moment.momentID)).toBeNull();
});
