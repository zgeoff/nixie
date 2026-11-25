import { expect, test } from 'bun:test';
import { readPreviewPage } from './read-preview-page';

test('it reads the markup of the entry page among the files', () => {
  const files = [
    { path: 'images/0', mediaType: 'image/png', base64: 'AQID' },
    {
      path: 'index.html',
      mediaType: 'text/html',
      base64: Buffer.from('<b>x</b>').toString('base64'),
    },
  ];

  expect(readPreviewPage(files)).toBe('<b>x</b>');
});
