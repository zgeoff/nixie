import { expect, test } from 'bun:test';
import { readImageID, readToolResult } from './read-tool-result';

test('it reads the structured content of a result', () => {
  expect(readToolResult({ content: [], structuredContent: { image: 'k3x9m2p7qa' } })).toStrictEqual(
    {
      image: 'k3x9m2p7qa',
    },
  );
});

test('it reads the JSON text that leads a result with images', () => {
  expect(
    readToolResult({
      content: [
        { type: 'text', text: '{"image":"k3x9m2p7qa"}' },
        { type: 'image', data: 'AAAA', mimeType: 'image/png' },
      ],
    }),
  ).toStrictEqual({ image: 'k3x9m2p7qa' });
});

test('it reads the ID of the image a result names', () => {
  expect(readImageID({ image: 'k3x9m2p7qa', size: '1x1' })).toBe('k3x9m2p7qa');
});
