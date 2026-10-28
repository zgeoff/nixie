import { expect, test } from 'bun:test';
import { store } from './store';
import { writeMockMomentChange } from './write-mock-moment-change';

test('it writes a note dated now and moves the moment to its next version', async () => {
  const moment = await store.moments.create({ title: 'The fern' });

  const result = await writeMockMomentChange({
    clientActionID: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    momentID: moment.momentID,
    version: 1,
    change: { kind: 'note', note: 'It liked the north window.' },
  });

  const changed = store.moments.findFirst((query) => query.where({ momentID: moment.momentID }));

  expect(result).toStrictEqual({ status: 'applied' });

  expect(changed).toMatchObject({
    version: 2,
    editedAt: expect.any(Date),
    note: { text: 'It liked the north window.', writtenAt: expect.any(Date) },
  });
});

test('it refuses a change bound to a version the moment moved past', async () => {
  const moment = await store.moments.create({ version: 3 });

  const result = await writeMockMomentChange({
    clientActionID: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    momentID: moment.momentID,
    version: 2,
    change: { kind: 'title', title: 'The fern' },
  });

  expect(result).toStrictEqual({ status: 'stale' });
});

test('it answers a retry with the same action ID as applied, and changes the moment once', async () => {
  const moment = await store.moments.create({});

  const change = {
    clientActionID: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    momentID: moment.momentID,
    version: 1,
    change: { kind: 'title' as const, title: 'The fern' },
  };

  await writeMockMomentChange(change);

  const retried = await writeMockMomentChange(change);

  const changed = store.moments.findFirst((query) => query.where({ momentID: moment.momentID }));

  expect(retried).toStrictEqual({ status: 'applied' });
  expect(changed?.version).toBe(2);
});

test('it links an item that the change names by its short ID', async () => {
  const item = await store.memoryItems.create({
    shortID: 'p2k7wd',
    versions: [{ text: 'Waters the fern weekly' }],
  });

  const moment = await store.moments.create({});

  await writeMockMomentChange({
    clientActionID: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    momentID: moment.momentID,
    version: 1,
    change: { kind: 'link', itemID: 'p2k7wd', isLinked: true },
  });

  const changed = store.moments.findFirst((query) => query.where({ momentID: moment.momentID }));

  expect(changed?.linkedItemIDs).toStrictEqual([item.itemID]);
});

test('it refuses edges that leave the thread', async () => {
  await store.records.create({ sequence: 2 });
  await store.records.create({ sequence: 3, thread: 'morning-reading' });

  const moment = await store.moments.create({ firstSequence: 2, lastSequence: 2 });

  const result = await writeMockMomentChange({
    clientActionID: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    momentID: moment.momentID,
    version: 1,
    change: { kind: 'edges', firstSequence: 2, lastSequence: 3 },
  });

  expect(result).toStrictEqual({ status: 'bad_span' });
});

test('it marks a destroyed moment, which no later change finds', async () => {
  const moment = await store.moments.create({});

  await writeMockMomentChange({
    clientActionID: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    momentID: moment.momentID,
    version: 1,
    change: { kind: 'destroy' },
  });

  const later = await writeMockMomentChange({
    clientActionID: '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f',
    momentID: moment.momentID,
    version: 2,
    change: { kind: 'title', title: 'The fern' },
  });

  expect(later).toStrictEqual({ status: 'not_found' });
});
