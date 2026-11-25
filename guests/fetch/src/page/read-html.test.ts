import { expect, test } from 'bun:test';
import { formatLinkMark } from '@heynixie/wire';
import { readHTML } from './read-html';

function setupTest() {
  return {
    limits: { bodyBytes: 1000, timeoutMs: 1000, redirects: 0, textBytes: 10_000, imageBytes: 0 },
  };
}

test('it reads the text of an HTML document and the target of each link, with no request', () => {
  const ctx = setupTest();

  const reply = readHTML(
    '<html><body><p>Tap <a href="https://library.example.org/reset?token=t0k3n">Reset password</a>.</p></body></html>',
    'about:blank',
    ctx.limits,
  );

  expect(reply).toStrictEqual({
    kind: 'page',
    url: 'about:blank',
    status: 200,
    contentType: 'text/html',
    text: expect.stringContaining(formatLinkMark(0)),
    links: ['https://library.example.org/reset?token=t0k3n'],
    isTruncated: false,
    blocked: null,
    retryAfterMs: null,
    isGated: false,
  });
});

test('it drops the scripts and the styles of the document', () => {
  const ctx = setupTest();

  const reply = readHTML(
    '<style>p { color: red }</style><script>alert(1)</script><p>Your code is 482913.</p>',
    'about:blank',
    ctx.limits,
  );

  const text = reply.kind === 'page' ? reply.text : null;

  expect(text).toStartWith('Your code is 482913.');
});

test('it cuts the text at the limit and says so', () => {
  const ctx = setupTest();

  const reply = readHTML(`<p>${'word '.repeat(100)}</p>`, 'about:blank', {
    ...ctx.limits,
    textBytes: 20,
  });

  expect(reply).toMatchObject({ kind: 'page', isTruncated: true });
});

test('it fails for a base address that is no address', () => {
  const ctx = setupTest();

  expect(readHTML('<p>hi</p>', 'not an address', ctx.limits)).toStrictEqual({
    kind: 'failed',
    reason: 'the base address of the HTML is not an address',
    isGated: false,
  });
});
