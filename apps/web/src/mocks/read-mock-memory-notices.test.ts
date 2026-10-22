import { expect, test } from 'bun:test';
import { readMockMemoryNotices } from './read-mock-memory-notices';
import { store } from './store';
import { writeMockMemoryChange } from './write-mock-memory-change';

test("it reads a thread's notice with its counts and each item as it now stands", async () => {
  const item = await store.memoryItems.create({
    shortID: 'r7k2pa',
    versions: [{ text: 'Runs on Sundays' }, { change: 'retired', state: 'retired' }],
    state: 'retired',
  });

  await store.memoryNotices.create({
    entries: [
      { itemID: item.itemID, sequence: 4 },
      { change: 'proposed', itemID: 'item-b', proposalID: 'proposal-b', version: null },
    ],
    kind: 'turn',
    messageSequence: 3,
    noticeKey: `turn/conversation/${String(3)}`,
  });

  expect(readMockMemoryNotices('conversation')).toMatchObject([
    {
      kind: 'turn',
      messageSequence: 3,
      noticeKey: `turn/conversation/${String(3)}`,
      proposed: 1,
      remembered: 1,
      retired: 0,
      entries: [
        {
          change: 'created',
          isKept: false,
          item: { change: 'retired', shortID: 'r7k2pa', state: 'retired', version: 2 },
          itemID: item.itemID,
          sequence: 4,
          version: 1,
        },
        { change: 'proposed', item: null, proposalID: 'proposal-b', version: null },
      ],
    },
  ]);
});

test('it reads no notice of another thread', async () => {
  const item = await store.memoryItems.create({ versions: [{ text: 'Runs on Sundays' }] });

  await store.memoryNotices.create({ entries: [{ itemID: item.itemID }], thread: 'task-4' });

  expect(readMockMemoryNotices('conversation')).toStrictEqual([]);
});

test('it reads an item you kept at the version written as kept', async () => {
  const item = await store.memoryItems.create({ versions: [{ text: 'Runs on Sundays' }] });

  await store.memoryNotices.create({ entries: [{ itemID: item.itemID }] });

  await writeMockMemoryChange({
    change: 'keep',
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  });

  expect(readMockMemoryNotices('conversation')).toMatchObject([{ entries: [{ isKept: true }] }]);
});
