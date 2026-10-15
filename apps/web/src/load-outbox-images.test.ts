import { expect, test } from 'bun:test';
import { loadOutboxImages } from './load-outbox-images';
import { writeOutboxImages } from './write-outbox-images';

test('it gives the message with its images once every kept image reads back', async () => {
  await writeOutboxImages('5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', [
    new File([new Uint8Array([1])], 'porch.png', { type: 'image/png' }),
    new File([new Uint8Array([2])], 'garden.png', { type: 'image/png' }),
  ]);

  const loaded = await loadOutboxImages({
    clientMessageId: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    spans: [{ end: 9, source: 'typed', start: 0 }],
    text: 'Two views',
    thread: 'conversation',
    unreadImages: 2,
  });

  expect(loaded.unreadImages).toBeUndefined();
  expect(loaded.images?.map((image) => image.name)).toStrictEqual(['porch.png', 'garden.png']);
});

test('it leaves the images unread when fewer read back than the message keeps', async () => {
  await writeOutboxImages('5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', [
    new File([new Uint8Array([1])], 'porch.png', { type: 'image/png' }),
  ]);

  const message = {
    clientMessageId: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    spans: [{ end: 9, source: 'typed' as const, start: 0 }],
    text: 'Two views',
    thread: 'conversation',
    unreadImages: 2,
  };

  const loaded = await loadOutboxImages(message);

  expect(loaded).toBe(message);
});

test('it gives a message with no kept images as it is, with no read', async () => {
  const message = {
    clientMessageId: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    spans: [{ end: 6, source: 'typed' as const, start: 0 }],
    text: 'No views',
    thread: 'conversation',
  };

  const loaded = await loadOutboxImages(message);

  expect(loaded).toBe(message);
});
