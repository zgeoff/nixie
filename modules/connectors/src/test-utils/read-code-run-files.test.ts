import { expect, test } from 'bun:test';
import { readCodeRunFiles } from './read-code-run-files';

test('it reads the files from the fenced text block', () => {
  const files = [
    { file: 'p3n8x2c7ke', path: 'out/a.png', bytes: 3, mediaType: 'image/png', isShown: true },
  ];

  expect(
    readCodeRunFiles({
      content: [
        {
          type: 'text',
          text: `<tool-result source="untrusted" fence="5d1e">\n${JSON.stringify({ files })}\n</tool-result fence="5d1e">`,
        },
        { type: 'image', data: 'AQID', mimeType: 'image/png' },
      ],
    }),
  ).toStrictEqual([{ file: 'p3n8x2c7ke', path: 'out/a.png', isShown: true }]);
});
