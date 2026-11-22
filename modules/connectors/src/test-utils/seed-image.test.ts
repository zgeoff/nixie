import { expect, test } from 'bun:test';
import { readImageEntry } from '../image/read-image-entry';
import { seedImage } from './seed-image';
import { startTestLog } from './start-test-log';

test('it leaves an image that reads back with the bytes it was seeded with', async () => {
  const log = await startTestLog();

  const bytes = new TextEncoder().encode('seeded-bytes');

  await seedImage(log, { image: 'k3x9m2p7qa', source: 'draw', bytes });

  const entry = await readImageEntry(log, 'k3x9m2p7qa');

  expect(entry).toMatchObject({ kind: 'ok', bytes });
});

test('it writes the call and result records and the images row in one transaction', async () => {
  const log = await startTestLog();

  const bytes = new TextEncoder().encode('seeded-bytes');

  await seedImage(log, { image: 'earlier001', source: 'draw', bytes });

  const seeded = await seedImage(log, {
    image: 'k3x9m2p7qa',
    source: 'draw',
    bytes,
    prompt: 'a harbour at dusk',
    isPinned: true,
    from: 'earlier001',
    createdAtMs: 5,
  });

  const entry = await readImageEntry(log, 'k3x9m2p7qa');

  expect({ seeded, row: entry.kind === 'missing' ? null : entry.row }).toMatchObject({
    seeded: {
      callSequence: expect.any(Number),
      sequence: expect.any(Number),
      uuid: expect.any(String),
    },
    row: {
      sequence: seeded.sequence,
      uuid: seeded.uuid,
      parent_id: 'earlier001',
      is_pinned: 1,
      created_at: 5,
      source: 'draw',
    },
  });
});
