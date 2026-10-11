import { expect, test } from 'bun:test';
import { buildReadableText } from './build-readable-text';

test('it returns the readable text of a page', () => {
  const html = `<!doctype html>
<html>
  <head><title>Example</title><style>p { color: red }</style></head>
  <body>
    <script>window.secret = 'never shown';</script>
    <h1>Example   Domain</h1>
    <p>This domain is for use in <a href="/x">examples</a>.<br>Second line.</p>
    <ul><li>one</li><li>two</li></ul>
    <noscript>Turn on scripts</noscript>
    <svg><text>a drawing</text></svg>
  </body>
</html>`;

  expect(buildReadableText(html)).toBe(
    'Example Domain\n\nThis domain is for use in examples.\nSecond line.\n\none\n\ntwo',
  );
});

test('it decodes numeric and common named entities', () => {
  expect(buildReadableText('<p>a &amp; b &lt;c&gt; &#169; &#x2014; &rsquo;</p>')).toBe(
    'a & b <c> © — ’',
  );
});

test('it keeps a named reference it does not know as written', () => {
  expect(buildReadableText('<p>&unknownx;</p>')).toBe('&unknownx;');
});

test('it reads the text of a page cut off inside a tag', () => {
  expect(buildReadableText('<p>first</p><p>second <scr')).toBe('first\n\nsecond');
});

test('it returns no text from a script left open', () => {
  expect(buildReadableText('<p>shown</p><script>var a = "hidden')).toBe('shown');
});
