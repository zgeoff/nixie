import { expect, test } from 'bun:test';
import { store } from './store';
import { toMockMemoryItem } from './to-mock-memory-item';

test('it lists an item at its current version, with the times of its first and latest versions', async () => {
  const item = await store.memoryItems.create({
    shortID: 'k3v9q2',
    versions: [
      { recordedAt: new Date('2026-03-01T09:00:00Z'), text: 'Plays the cello on Thursdays' },
      {
        change: 'edited',
        origin: 'memory_writer',
        recordedAt: new Date('2026-04-01T09:00:00Z'),
        text: 'Plays the cello on Fridays',
      },
    ],
  });

  expect(toMockMemoryItem(item)).toStrictEqual({
    changedAt: new Date('2026-04-01T09:00:00Z'),
    createdAt: new Date('2026-03-01T09:00:00Z'),
    forgottenAt: null,
    isPinned: false,
    itemID: item.itemID,
    kind: 'fact',
    origin: 'memory_writer',
    shortID: 'k3v9q2',
    source: 'owner',
    state: 'active',
    status: 'readable',
    subject: 'owner',
    text: 'Plays the cello on Fridays',
    version: 2,
  });
});

test('it lists a forgotten item as a gap with no text', async () => {
  const item = await store.memoryItems.create({
    forgottenAt: new Date('2026-05-01T09:00:00Z'),
    state: 'forgotten',
    versions: [{ text: 'Owes Robin twenty pounds' }],
  });

  expect(toMockMemoryItem(item)).toMatchObject({
    forgottenAt: new Date('2026-05-01T09:00:00Z'),
    state: 'forgotten',
    status: 'shredded',
  });

  expect(toMockMemoryItem(item)).not.toContainKey('text');
});

test('it lists a forgetting item whose key still exists with its text', async () => {
  const item = await store.memoryItems.create({
    isShredded: false,
    state: 'forgetting',
    versions: [{ text: 'Owes Robin twenty pounds' }],
  });

  expect(toMockMemoryItem(item)).toMatchObject({
    state: 'forgetting',
    status: 'readable',
    text: 'Owes Robin twenty pounds',
  });
});
