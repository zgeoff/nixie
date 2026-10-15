import { expect, test } from 'bun:test';
import { countImageBytes } from './count-image-bytes';

test('it counts the base64 bytes of every image of the message', () => {
  expect(
    countImageBytes({
      uuid: '3c1f6a2e-8b4d-4e7f-9a0c-5d2b1e8f7a64',
      text: 'Two plans',
      images: [
        {
          marker: '<dropped-image id="0a1b2c3d4e5f" n="1"/>',
          mediaType: 'image/png',
          data: 'iVBORw==',
        },
        {
          marker: '<dropped-image id="6a7b8c9d0e1f" n="2"/>',
          mediaType: 'image/jpeg',
          data: '/9j/',
        },
      ],
    }),
  ).toBe(12);
});

test('it counts no bytes for a message with no images', () => {
  expect(
    countImageBytes({ uuid: '3c1f6a2e-8b4d-4e7f-9a0c-5d2b1e8f7a64', text: 'Only words' }),
  ).toBe(0);
});
