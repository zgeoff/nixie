import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { startTestMemory } from './start-test-memory';
import { writeOwnerMessageRecord } from './write-owner-message-record';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it writes a message of yours with its text and spans in the erasable fields', async () => {
  const ctx = await setupTest();

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [
      { start: 0, end: 7, source: 'typed' },
      { start: 7, end: 22, source: 'pasted' },
    ],
  });

  const [entry] = await readRecords(ctx.memory.log, { afterSequence: sequence - 1, limit: 1 });

  expect(entry?.record).toMatchObject({
    sequence,
    kind: 'owner_message',
    thread: 'conversation',
    contentSource: 'owner',
    erasable: {
      status: 'readable',
      fields: {
        text: 'I take my coffee black',
        spans: [
          { start: 0, end: 7, source: 'typed' },
          { start: 7, end: 22, source: 'pasted' },
        ],
      },
    },
  });

  expect(entry?.record.payload).toStrictEqual({ spans: 'as_sent' });
});

test('it names the media type of each image in the payload, in the order sent', async () => {
  const ctx = await setupTest();

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Two shots from the hike',
    spans: [{ start: 0, end: 23, source: 'typed' }],
    images: ['image/jpeg', 'image/png'],
  });

  const [entry] = await readRecords(ctx.memory.log, { afterSequence: sequence - 1, limit: 1 });

  expect(entry?.record.payload).toStrictEqual({
    spans: 'as_sent',
    images: [{ mediaType: 'image/jpeg' }, { mediaType: 'image/png' }],
  });
});
