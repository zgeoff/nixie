import { expect, test } from 'bun:test';
import { parsePreviewLink } from './parse-preview-link';

test('it reads the link from the preview comment', () => {
  const bodies = [
    'Looks good to me.',
    '<!-- cloud-preview -->\n**Preview:** http://previews.example:8417/octo/garden/12\n\nOpening the link boots it.',
  ];

  expect(parsePreviewLink(bodies)?.href).toBe('http://previews.example:8417/octo/garden/12');
});

test('it returns null when no comment holds the preview marker', () => {
  expect(parsePreviewLink(['**Preview:** http://previews.example:8417/octo/garden/12'])).toBeNull();
});
