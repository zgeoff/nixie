import { expect, test } from 'bun:test';
import { readMockMomentDestroyPreview } from './read-mock-moment-destroy-preview';
import { store } from './store';

test('it counts the texts and links the destroy shreds and the span records it keeps', async () => {
  const item = await store.memoryItems.create({ versions: [{ text: 'Waters the fern weekly' }] });

  await store.records.create({ sequence: 2, kind: 'owner_message' });
  await store.records.create({ sequence: 3, kind: 'model.reply' });

  const moment = await store.moments.create({
    firstSequence: 2,
    lastSequence: 3,
    title: 'The fern',
    note: { text: 'It liked the north window.', writtenAt: new Date('2026-10-01T09:00:00Z') },
    reflections: [{ text: 'Light mattered most.' }],
    linkedItemIDs: [item.itemID],
  });

  const read = readMockMomentDestroyPreview({ momentID: moment.momentID, version: 1 });

  expect(read).toMatchObject({
    status: 'read',
    preview: { title: 'The fern', kept: { records: 2 }, lost: { links: 1, texts: 3 } },
  });
});

test('it refuses a preview bound to a version the moment moved past', async () => {
  const moment = await store.moments.create({ version: 2 });

  expect(readMockMomentDestroyPreview({ momentID: moment.momentID, version: 1 })).toStrictEqual({
    status: 'stale',
  });
});
