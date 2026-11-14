import { expect, test } from 'bun:test';
import { countImages } from './count-images';

test('it counts every image of the message and their base64 bytes', () => {
  expect(
    countImages({
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
  ).toStrictEqual({ bytes: 12, count: 2 });
});

test('it counts no images for a message with none', () => {
  expect(
    countImages({ uuid: '3c1f6a2e-8b4d-4e7f-9a0c-5d2b1e8f7a64', text: 'Only words' }),
  ).toStrictEqual({ bytes: 0, count: 0 });
});
