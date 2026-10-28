import { expect, test } from 'bun:test';
import { readMockMomentSpan } from './read-mock-moment-span';
import { store } from './store';

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
