import { expect, test } from 'bun:test';
import { readOutboxImages } from './read-outbox-images';
import { runOutboxImagesRequest } from './run-outbox-images-request';
import { writeOutboxImages } from './write-outbox-images';

test('it reads the images kept for the message asked for', async () => {
  await writeOutboxImages('0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60', [
    new File([new Uint8Array([1])], 'porch.png', { type: 'image/png' }),
  ]);

  await writeOutboxImages('5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', [
    new File([new Uint8Array([2])], 'garden.png', { type: 'image/png' }),
  ]);

  const images = await readOutboxImages('5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85');

  expect(images.map((image) => image.name)).toStrictEqual(['garden.png']);
});

test('it reads no images for a message the device keeps none for', async () => {
  const images = await readOutboxImages('0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60');

  expect(images).toStrictEqual([]);
});

test('it reads no images when what the device keeps is not a list of files', async () => {
  await runOutboxImagesRequest('readwrite', (store) =>
    store.put('not files', '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60'),
  );

  const images = await readOutboxImages('0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60');

  expect(images).toStrictEqual([]);
});
