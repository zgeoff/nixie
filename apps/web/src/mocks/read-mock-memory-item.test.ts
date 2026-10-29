import { expect, test } from 'bun:test';
import { readMockMemoryItem } from './read-mock-memory-item';
import { store } from './store';

test('it reads each version with its provenance and its quote inside the message it came from', async () => {
  const message = await store.records.create({
    message: { text: 'Quick one: my sister Ana lives in Porto now.' },
  });

  const item = await store.memoryItems.create({
    versions: [
      {
        checkerModel: 'checker-model-1',
        checks: { quote: 'pass' },
        evidence: { end: 39, sequence: message.sequence, start: 11 },
        evidenceQuote: 'my sister Ana lives in Porto',
        origin: 'memory_writer',
        recordedAt: new Date('2026-03-01T09:00:00Z'),
        taskID: 'memory-writer',
        text: "The user's sister Ana lives in Porto",
        writerModel: 'writer-model-1',
      },
    ],
  });

  const detail = readMockMemoryItem(item.itemID);

  expect(detail?.versions).toStrictEqual([
    {
      change: 'created',
      checkerModel: 'checker-model-1',
      checks: { quote: 'pass' },
      evidence: {
        end: 39,
        message: { status: 'readable', text: 'Quick one: my sister Ana lives in Porto now.' },
        sequence: message.sequence,
        start: 11,
      },
      evidenceQuote: 'my sister Ana lives in Porto',
      image: null,
      origin: 'memory_writer',
      proposalID: null,
      recordedAt: new Date('2026-03-01T09:00:00Z'),
      source: 'owner',
      state: 'active',
      status: 'readable',
      taskID: 'memory-writer',
      text: "The user's sister Ana lives in Porto",
      version: 1,
      writerModel: 'writer-model-1',
    },
  ]);
});

test('it reads a version made from a photo with the image it came from', async () => {
  const item = await store.memoryItems.create({
    versions: [{ image: { position: 1, sequence: 9, thread: 'conversation' } }],
  });

  const detail = readMockMemoryItem(item.itemID);

  expect(detail?.versions[0]?.image).toStrictEqual({
    position: 1,
    sequence: 9,
    thread: 'conversation',
  });
});

test('it reads the message of a forgotten message as forgotten', async () => {
  const message = await store.records.create({ kind: 'owner_message' });

  await store.records.update(message, {
    data(draft) {
      delete draft.message;
    },
  });

  const item = await store.memoryItems.create({
    versions: [{ evidence: { end: 4, sequence: message.sequence, start: 0 } }],
  });

  const detail = readMockMemoryItem(item.itemID);

  expect(detail?.versions[0]?.evidence?.message).toStrictEqual({ status: 'shredded' });
});

test('it reads a forgotten item as gaps that show no message and no quote', async () => {
  const message = await store.records.create({ message: { text: 'I owe Robin twenty pounds.' } });

  const item = await store.memoryItems.create({
    state: 'forgotten',
    versions: [
      {
        evidence: { end: 25, sequence: message.sequence, start: 0 },
        evidenceQuote: 'I owe Robin twenty pounds',
      },
    ],
  });

  const detail = readMockMemoryItem(item.itemID);

  expect(detail?.versions[0]).toMatchObject({
    evidence: { message: null },
    evidenceQuote: null,
    status: 'shredded',
  });
});

test('it reads a forgotten item made from a photo with no image', async () => {
  const item = await store.memoryItems.create({
    state: 'forgotten',
    versions: [{ image: { position: 0, sequence: 9, thread: 'conversation' } }],
  });

  const detail = readMockMemoryItem(item.itemID);

  expect(detail?.versions[0]).toMatchObject({ image: null, status: 'shredded' });
});

test('it reads a version whose text fails to open as unreadable, with no message and no quote', async () => {
  const message = await store.records.create({ message: { text: 'I owe Robin twenty pounds.' } });

  const item = await store.memoryItems.create({
    versions: [
      {
        evidence: { end: 25, sequence: message.sequence, start: 0 },
        evidenceQuote: 'I owe Robin twenty pounds',
        isUnreadable: true,
      },
    ],
  });

  const detail = readMockMemoryItem(item.itemID);

  expect(detail?.versions[0]).toMatchObject({
    evidence: { message: null },
    evidenceQuote: null,
    status: 'unreadable',
  });
});

test('it reads an item that does not exist as null', () => {
  expect(readMockMemoryItem('no-such-item')).toBeNull();
});
