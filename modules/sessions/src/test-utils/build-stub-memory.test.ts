import { expect, test } from 'bun:test';
import { buildStubMemory } from './build-stub-memory';

test('it answers the pinned items and their use it is given', async () => {
  const memory = buildStubMemory({
    pinned: [
      {
        itemID: '2f6c0d1e-8a4b-4c7d-9e2f-5b1a3c8d7e60',
        version: 1,
        shortID: 'r7t2v9x4kq',
        subject: 'owner',
        text: 'Rows on the canal on Sundays',
        origin: 'owner',
        source: 'owner',
        model: null,
        recordedAt: Date.UTC(2026, 8, 12),
        evidenceQuote: null,
        approval: null,
      },
    ],
    pinnedUse: { items: 1, tokens: 9, budget: 2000 },
  });

  const pinned = await memory.readPinnedCore();
  const use = await memory.readPinnedCoreUse();

  expect(pinned.map((item) => item.text)).toStrictEqual(['Rows on the canal on Sundays']);
  expect(use).toStrictEqual({ items: 1, tokens: 9, budget: 2000 });
});

test('it answers each search with no item and keeps the query it was given', async () => {
  const memory = buildStubMemory({ pinned: [], pinnedUse: { items: 0, tokens: 0, budget: 2000 } });

  const request = {
    query: 'canal locks',
    limit: 5,
    selfNoteLimit: 2,
    minScore: 0.25,
    minSimilarity: 0.38,
    excludePinned: true,
    excludeSensitive: true,
    excludedVersions: [],
    excludedWords: [],
    thread: 'conversation',
  } as const;

  const found = await memory.recall(request);

  expect(found).toStrictEqual({ items: [] });
  expect(memory.recall.mock.calls).toStrictEqual([[request]]);
});

test('it answers each message search with no message and each short ID lookup with none', async () => {
  const memory = buildStubMemory({ pinned: [], pinnedUse: { items: 0, tokens: 0, budget: 2000 } });

  const messages = await memory.recallMessages({
    query: 'canal locks',
    limit: 3,
    minScore: 0.25,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  const shortIDs = await memory.readShortIDs(['2f6c0d1e-8a4b-4c7d-9e2f-5b1a3c8d7e60']);

  expect(messages).toStrictEqual({ messages: [] });
  expect(shortIDs).toStrictEqual(new Map());
});
