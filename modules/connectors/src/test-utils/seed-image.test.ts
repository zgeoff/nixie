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
