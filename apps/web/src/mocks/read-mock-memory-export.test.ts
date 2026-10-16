import { expect, test } from 'bun:test';
import { readMockMemoryExport } from './read-mock-memory-export';
import { store } from './store';

test('it reads a readable item with every version and a forgotten item as only its ID and time', async () => {
  const active = await store.memoryItems.create({
    isPinned: true,
    shortID: 'k3m9qa',
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

  const chunks = await Array.fromAsync(readMockMemoryExport(new Date('2026-10-14T08:00:00.000Z')));

  expect(JSON.parse(chunks.join('')).items).toStrictEqual([
    {
      itemID: active.itemID,
      shortID: 'k3m9qa',
      state: 'active',
      isPinned: true,
      versions: [
        {
          version: 1,
          change: 'created',
          state: 'active',
          text: 'Rents allotment plot 14',
          evidenceQuote: 'the allotment plot is number 14',
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
  ]);
});

test('it heads the file with schema version 1, the export time and the mock snapshot hash', async () => {
  const chunks = await Array.fromAsync(readMockMemoryExport(new Date('2026-10-14T08:00:00.000Z')));

  expect(JSON.parse(chunks.join(''))).toStrictEqual({
    header: {
      schemaVersion: 1,
      exportedAt: '2026-10-14T08:00:00.000Z',
      snapshotHash: 'sha256:mock',
    },
    items: [],
  });
});

test('it reads a version whose text fails to open with no text and no quote', async () => {
  await store.memoryItems.create({
    versions: [{ evidenceQuote: 'plot 14', isUnreadable: true, text: 'Rents allotment plot 14' }],
  });

  const chunks = await Array.fromAsync(readMockMemoryExport(new Date('2026-10-14T08:00:00.000Z')));

  expect(JSON.parse(chunks.join(''))).toMatchObject({
    items: [{ versions: [{ text: null, evidenceQuote: null }] }],
  });
});
