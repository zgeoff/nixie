import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { seedImage } from '../test-utils/seed-image';
import { seedImageName } from '../test-utils/seed-image-name';
import { startTestLog } from '../test-utils/start-test-log';
import { imageNamedCodec } from './image-named-codec';
import { readImageNames } from './read-image-names';

test('it reads the name of each of 150 images, past the 100 records a read returns by default', async () => {
  const log = await startTestLog();

  const ids = Array.from({ length: 150 }, (_, index) => `img${String(index).padStart(7, '0')}`);

  await writeRecords(
    log,
    ids.map((image) => ({
      kind: imageNamedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: imageNamedCodec.encode({ image }),
      erasable: { name: `name of ${image}` },
    })),
  );

  const names = await readImageNames(log, ids);

  expect(names.size).toBe(150);
});

test('it reads the latest name of each image', async () => {
  const log = await startTestLog();

  const bytes = new TextEncoder().encode('bytes');

  await seedImage(log, { image: 'img0000001', source: 'draw', bytes });
  await seedImage(log, { image: 'img0000002', source: 'draw', bytes });
  await seedImageName(log, { image: 'img0000001', name: 'first try' });
  await seedImageName(log, { image: 'img0000002', name: 'other' });
  await seedImageName(log, { image: 'img0000001', name: null });
  await seedImageName(log, { image: 'img0000002', name: 'other, final' });

  const names = await readImageNames(log, ['img0000001', 'img0000002']);

  expect([...names].toSorted((left, right) => left[0].localeCompare(right[0]))).toStrictEqual([
    ['img0000001', null],
    ['img0000002', 'other, final'],
  ]);
});

test('it returns no entry for an image with no name record', async () => {
  const log = await startTestLog();
  const names = await readImageNames(log, ['img0000001']);

  expect(names.size).toBe(0);
});
