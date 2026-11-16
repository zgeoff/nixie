import { expect, test } from 'bun:test';
import { buildTurnInput } from './build-turn-input';

test('it gives one text item for a message with no image', () => {
  expect(
    buildTurnInput([{ uuid: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d003', text: 'Hi.' }], '/work'),
  ).toStrictEqual({ items: [{ type: 'text', text: 'Hi.', text_elements: [] }], files: [] });
});

test('it puts each image in place of its marker', () => {
  const input = buildTurnInput(
    [
      {
        uuid: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d003',
        text: 'A [image 1] and B [image 2].',
        images: [
          { marker: '[image 1]', mediaType: 'image/png', data: 'AAAA' },
          { marker: '[image 2]', mediaType: 'image/jpeg', data: 'BBBB' },
        ],
      },
    ],
    '/work',
  );

  expect(input).toStrictEqual({
    items: [
      { type: 'text', text: 'A ', text_elements: [] },
      { type: 'localImage', path: '/work/image-1.png' },
      { type: 'text', text: ' and B ', text_elements: [] },
      { type: 'localImage', path: '/work/image-2.jpg' },
      { type: 'text', text: '.', text_elements: [] },
    ],
    files: [
      { name: 'image-1.png', base64: 'AAAA' },
      { name: 'image-2.jpg', base64: 'BBBB' },
    ],
  });
});

test('it appends an image whose marker the text lacks, and numbers images across messages', () => {
  const input = buildTurnInput(
    [
      { uuid: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d003', text: 'First.' },
      {
        uuid: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d004',
        text: 'Second.',
        images: [{ marker: '[gone]', mediaType: 'image/webp', data: 'CCCC' }],
      },
    ],
    '/work',
  );

  expect(input.items).toStrictEqual([
    { type: 'text', text: 'First.', text_elements: [] },
    { type: 'text', text: 'Second.', text_elements: [] },
    { type: 'localImage', path: '/work/image-1.webp' },
  ]);
});
