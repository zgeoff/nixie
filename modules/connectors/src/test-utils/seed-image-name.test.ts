import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { readImageNames } from '../image/read-image-names';
import { seedImage } from './seed-image';
import { seedImageName } from './seed-image-name';
import { startTestLog } from './start-test-log';

test('it leaves a name record that reads back as the image name', async () => {
  const log = await startTestLog();

  const bytes = new TextEncoder().encode('bytes');

  await seedImage(log, { image: 'k3x9m2p7qa', source: 'draw', bytes });

  const seeded = await seedImageName(log, { image: 'k3x9m2p7qa', name: 'cove, final' });
  const [named] = await readRecords(log, { afterSequence: 0, kinds: ['image.named'] });
  const names = await readImageNames(log, ['k3x9m2p7qa']);

  expect({ sequence: named?.record.sequence, name: names.get('k3x9m2p7qa') }).toStrictEqual({
    sequence: seeded.sequence,
    name: 'cove, final',
  });
});
