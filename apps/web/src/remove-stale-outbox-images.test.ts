import { expect, test } from 'bun:test';
import { readOutboxImages } from './read-outbox-images';
import { removeStaleOutboxImages } from './remove-stale-outbox-images';
import { writeOutboxImages } from './write-outbox-images';

test('it removes the images of every message the outbox no longer holds', async () => {
  await writeOutboxImages('0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60', [
    new File([new Uint8Array([1])], 'sent.png', { type: 'image/png' }),
  ]);

  await removeStaleOutboxImages(() => new Set());

  const images = await readOutboxImages('0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60');

  expect(images).toStrictEqual([]);
});

test('it never removes the images of a message the outbox still holds', async () => {
  await writeOutboxImages('0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60', [
    new File([new Uint8Array([1])], 'sent.png', { type: 'image/png' }),
  ]);

  await writeOutboxImages('5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', [
    new File([new Uint8Array([2])], 'unsent.png', { type: 'image/png' }),
  ]);

  await removeStaleOutboxImages(() => new Set(['5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85']));

  const images = await readOutboxImages('5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85');

  expect(images.map((image) => image.name)).toStrictEqual(['unsent.png']);
});

test('it keeps the images of a message stored after the removal starts and before it reads the store', async () => {
  await writeOutboxImages('5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', [
    new File([new Uint8Array([2])], 'unsent.png', { type: 'image/png' }),
  ]);

  // another tab stores the message once the removal has started
  const stored = { ids: new Set<string>() };
  const removal = removeStaleOutboxImages(() => stored.ids);

  stored.ids = new Set(['5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85']);

  await removal;

  const images = await readOutboxImages('5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85');

  expect(images.map((image) => image.name)).toStrictEqual(['unsent.png']);
});
