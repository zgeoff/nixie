import { expect, test } from 'bun:test';
import { readOutboxImages } from './read-outbox-images';
import { writeOutboxImages } from './write-outbox-images';

test('it keeps the images of a message, which a later read returns as they were', async () => {
  await writeOutboxImages('0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60', [
    new File([new Uint8Array([0x89, 0x50])], 'shelf.png', { type: 'image/png' }),
    new File([new Uint8Array([0xff, 0xd8])], 'desk.jpg', { type: 'image/jpeg' }),
  ]);

  const images = await readOutboxImages('0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60');
  const bytes = await Promise.all(images.map((image) => image.bytes()));

  expect(images.map((image) => [image.name, image.type])).toStrictEqual([
    ['shelf.png', 'image/png'],
    ['desk.jpg', 'image/jpeg'],
  ]);

  expect(bytes).toStrictEqual([new Uint8Array([0x89, 0x50]), new Uint8Array([0xff, 0xd8])]);
});

test('it replaces the images it kept before for the same message', async () => {
  await writeOutboxImages('0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60', [
    new File([new Uint8Array([1])], 'first.png', { type: 'image/png' }),
  ]);

  await writeOutboxImages('0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60', [
    new File([new Uint8Array([2])], 'second.png', { type: 'image/png' }),
  ]);

  const images = await readOutboxImages('0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60');

  expect(images.map((image) => image.name)).toStrictEqual(['second.png']);
});
