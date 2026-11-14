import { expect, test } from 'bun:test';
import { readCodeRunFiles } from './read-code-run-files';

test('it reads the files from the structured content', () => {
  const files = [
    { file: 'p3n8x2c7ke', path: 'out/a.png', bytes: 3, mediaType: 'image/png', isShown: true },
  ];

  expect(readCodeRunFiles({ content: [], structuredContent: { files } })).toStrictEqual([
    { file: 'p3n8x2c7ke', path: 'out/a.png', isShown: true },
  ]);
});

test('it reads the files from the text block that comes beside images', () => {
  const files = [
    { file: 'p3n8x2c7ke', path: 'out/a.png', bytes: 3, mediaType: 'image/png', isShown: true },
  ];

  expect(
    readCodeRunFiles({ content: [{ type: 'text', text: JSON.stringify({ files }) }] }),
  ).toStrictEqual([{ file: 'p3n8x2c7ke', path: 'out/a.png', isShown: true }]);
});
