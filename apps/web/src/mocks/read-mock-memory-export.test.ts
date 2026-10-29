import { expect, test } from 'bun:test';
import { readMockMemoryExport } from './read-mock-memory-export';
import { store } from './store';

test('it reads a readable item with every version and a forgotten item as only its ID and time', async () => {
  const active = await store.memoryItems.create({
    versions: [
      {
        evidenceQuote: 'the allotment plot is number 14',
        recordedAt: new Date('2026-10-12T09:00:00.000Z'),
        text: 'Rents allotment plot 14',
      },
    ],
  });

  const forgotten = await store.memoryItems.create({
    forgottenAt: new Date('2026-10-13T18:31:00.000Z'),
    state: 'forgotten',
    versions: [{ text: 'Keeps a spare key under the blue pot' }],
  });

  const file: unknown = JSON.parse(readMockMemoryExport(new Date('2026-10-14T08:00:00Z')).join(''));

  expect(file).toStrictEqual({
    header: expect.toBeObject(),
    items: [
      {
        itemID: active.itemID,
        shortID: active.shortID,
        state: 'active',
        isPinned: false,
        isSensitive: false,
        subject: 'owner',
        versions: [
          {
            version: 1,
            change: 'created',
            state: 'active',
            text: 'Rents allotment plot 14',
            evidenceQuote: 'the allotment plot is number 14',
            until: null,
            provenance: {
              origin: 'owner',
              source: 'owner',
              taskID: null,
              proposalID: null,
              checks: null,
              writerModel: null,
              checkerModel: null,
              snapshotHash: 'sha256:mock',
              recordedAt: '2026-10-12T09:00:00.000Z',
            },
          },
        ],
      },
      { itemID: forgotten.itemID, forgottenAt: '2026-10-13T18:31:00.000Z' },
    ],
    moments: [],
  });
});

test('it reads the sensitive mark of an item', async () => {
  await store.memoryItems.create({
    isSensitive: true,
    versions: [{ text: 'The door code for the spare key box is 4417' }],
  });

  const chunks = readMockMemoryExport(new Date('2026-10-14T08:00:00.000Z'));

  expect(JSON.parse(chunks.join(''))).toMatchObject({ items: [{ isSensitive: true }] });
});

test('it reads a kept moment with its span and a destroyed moment as only its ID', async () => {
  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'the allotment plot is number 14' },
    recordedAt: new Date('2026-10-12T09:00:00.000Z'),
    sequence: 41,
  });

  const kept = await store.moments.create({
    firstSequence: message.sequence,
    keptAt: new Date('2026-10-12T09:05:00.000Z'),
    keptBy: 'owner',
    lastSequence: message.sequence,
    reflections: [],
    title: 'The allotment plot decision',
  });

  const destroyed = await store.moments.create({ state: 'destroyed' });

  const file: unknown = JSON.parse(readMockMemoryExport(new Date('2026-10-14T08:00:00Z')).join(''));

  expect(file).toMatchObject({
    moments: [
      {
        momentID: kept.momentID,
        shortID: kept.shortID,
        state: 'active',
        thread: 'conversation',
        firstSequence: 41,
        lastSequence: 41,
        keptBy: 'owner',
        keptThread: null,
        keptModel: null,
        keptAt: '2026-10-12T09:05:00.000Z',
        editedAt: null,
        title: 'The allotment plot decision',
        note: null,
        reflections: [],
        links: [],
        records: [
          {
            sequence: 41,
            kind: 'owner_message',
            recordedAt: '2026-10-12T09:00:00.000Z',
            source: 'owner',
            payload: null,
            decision: null,
            text: 'the allotment plot is number 14',
            isGap: false,
          },
        ],
      },
      { momentID: destroyed.momentID, destroyedAt: null },
    ],
  });
});

test('it heads the file with schema version 6, the export time and the mock snapshot hash', () => {
  const chunks = readMockMemoryExport(new Date('2026-10-14T08:00:00.000Z'));

  expect(JSON.parse(chunks.join(''))).toStrictEqual({
    header: {
      schemaVersion: 6,
      exportedAt: '2026-10-14T08:00:00.000Z',
      snapshotHash: 'sha256:mock',
    },
    items: [],
    moments: [],
  });
});

test('it reads a version whose text fails to open with no text and no quote', async () => {
  await store.memoryItems.create({
    versions: [{ evidenceQuote: 'plot 14', isUnreadable: true, text: 'Rents allotment plot 14' }],
  });

  const chunks = readMockMemoryExport(new Date('2026-10-14T08:00:00.000Z'));

  expect(JSON.parse(chunks.join(''))).toMatchObject({
    items: [{ versions: [{ text: null, evidenceQuote: null }] }],
  });
});
