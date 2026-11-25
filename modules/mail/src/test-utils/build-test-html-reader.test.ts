import { expect, test } from 'bun:test';
import { buildTestHTMLReader } from './build-test-html-reader';

test('it answers the HTML that a test named with the page the test gave', async () => {
  const reader = buildTestHTMLReader();

  reader.answer('<p>Hi</p>', {
    kind: 'page',
    url: 'about:blank',
    status: 200,
    contentType: 'text/html',
    text: 'Hi',
    links: [],
    isTruncated: false,
    blocked: null,
    retryAfterMs: null,
    isGated: false,
  });

  const reply = await reader.readHTML('<p>Hi</p>');

  expect(reply).toMatchObject({ kind: 'page', text: 'Hi' });
});

test('it fails for HTML that no test named', async () => {
  const reader = buildTestHTMLReader();

  const reply = await reader.readHTML('<p>Other</p>');

  expect(reply).toMatchObject({ kind: 'failed' });
});
