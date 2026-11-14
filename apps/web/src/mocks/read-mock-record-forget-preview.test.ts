import { expect, test } from 'bun:test';
import { readMockRecordForgetPreview } from './read-mock-record-forget-preview';
import { store } from './store';

test('it counts the live moments that hold the record and lists the items and pending new-item proposals that quote it', async () => {
  await Promise.all([
    store.moments.create({ firstSequence: 1, lastSequence: 3, thread: 'conversation' }),
    store.moments.create({ firstSequence: 3, lastSequence: 3, thread: 'conversation' }),
    store.moments.create({ firstSequence: 3, lastSequence: 3, state: 'destroyed' }),
    store.moments.create({ firstSequence: 4, lastSequence: 4 }),
  ]);

  const quoting = await store.memoryItems.create({
    versions: [
      { evidence: { end: 5, sequence: 3, start: 0 }, text: 'Keeps bees' },
      { text: 'Keeps two hives' },
    ],
  });

  await store.memoryItems.create({
    versions: [{ evidence: { end: 5, sequence: 4, start: 0 }, text: 'Likes tea' }],
  });

  await store.memoryItems.create({
    state: 'forgetting',
    versions: [{ evidence: { end: 5, sequence: 3, start: 0 }, text: 'Plays the oboe' }],
  });

  const proposal = await store.memoryProposals.create({
    evidence: { end: 5, sequence: 3, start: 0, message: null },
    text: 'Grows chillies',
  });

  const preview = readMockRecordForgetPreview('conversation', 3);

  expect(preview).toStrictEqual({
    momentCount: 2,
    memoryItems: [
      { itemID: quoting.itemID, text: 'Keeps two hives' },
      { itemID: proposal.itemID, text: 'Grows chillies' },
    ].toSorted((left, right) => left.itemID.localeCompare(right.itemID)),
  });
});
