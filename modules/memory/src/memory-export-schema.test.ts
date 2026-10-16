import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { memoryExportSchema } from './memory-export-schema';

test('it accepts the version 1 export file the fixture holds', async () => {
  const fixture: unknown = await Bun.file(
    join(import.meta.dir, 'fixtures', 'memory-export-v1.json'),
  ).json();

  const parsed: unknown = memoryExportSchema.safeParse(fixture).data;

  expect(parsed).toStrictEqual(fixture);
});

test('it rejects a forgotten item that carries more than its ID and time', () => {
  const result = memoryExportSchema.safeParse({
    header: {
      schemaVersion: 1,
      exportedAt: '2026-10-14T08:00:00.000Z',
      snapshotHash: 'sha256:4be1c0',
    },
    items: [
      {
        itemID: 'e2f84d19-5a7c-4b0e-a3d6-9c1f8b2e4a65',
        forgottenAt: '2026-10-13T18:31:00.000Z',
        text: 'Keeps a spare key under the blue pot',
      },
    ],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['items', 0] });
});

test('it rejects a file of another schema version', () => {
  const result = memoryExportSchema.safeParse({
    header: {
      schemaVersion: 2,
      exportedAt: '2026-10-14T08:00:00.000Z',
      snapshotHash: 'sha256:4be1c0',
    },
    items: [
      { itemID: 'e2f84d19-5a7c-4b0e-a3d6-9c1f8b2e4a65', forgottenAt: '2026-10-13T18:31:00.000Z' },
    ],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['header', 'schemaVersion'] });
});

test('it rejects a readable item with no version', () => {
  const result = memoryExportSchema.safeParse({
    header: {
      schemaVersion: 1,
      exportedAt: '2026-10-14T08:00:00.000Z',
      snapshotHash: 'sha256:4be1c0',
    },
    items: [
      {
        itemID: '0b7e3c52-6d1f-4a8e-9c2b-5f4d1e7a3b90',
        shortID: 'k3x9m2p7qa',
        state: 'active',
        isPinned: false,
        versions: [],
      },
    ],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['items', 0, 'versions'] });
});
