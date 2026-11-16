import { expect, test } from 'bun:test';
import { buildStubMemory } from './build-stub-memory';

test('it answers the pinned items and their use it is given', async () => {
  const memory = buildStubMemory({
    pinned: [
      {
        itemID: '2f6c0d1e-8a4b-4c7d-9e2f-5b1a3c8d7e60',
        version: 1,
        revision: 1,
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

test('it answers each turn memory ask with none and keeps the ask it was given', async () => {
  const memory = buildStubMemory({ pinned: [], pinnedUse: { items: 0, tokens: 0, budget: 2000 } });

  const ask = {
    text: 'canal locks',
    thread: 'conversation',
    excludedWords: [],
    held: { readVersions: () => Promise.resolve([]), readMessages: () => Promise.resolve([]) },
  };

  const turnMemory = await memory.readTurnMemory(ask);

  expect(turnMemory).toStrictEqual({ kind: 'none' });
  expect(memory.readTurnMemory.mock.calls).toStrictEqual([[ask]]);
});

test('it answers each short ID lookup with none', async () => {
  const memory = buildStubMemory({ pinned: [], pinnedUse: { items: 0, tokens: 0, budget: 2000 } });

  const shortIDs = await memory.readShortIDs(['2f6c0d1e-8a4b-4c7d-9e2f-5b1a3c8d7e60']);

  expect(shortIDs).toStrictEqual(new Map());
});
