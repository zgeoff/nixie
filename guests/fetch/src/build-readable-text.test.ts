import { expect, test } from 'bun:test';
import { buildReadableText } from './build-readable-text';

test('it returns the title and the readable text of a page', () => {
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
    'Example\n\nExample Domain\n\nThis domain is for use in examples.\nSecond line.\n\none\n\ntwo',
  );
});

test('it returns only the title and the main text of a page with a nav, a header and a footer', () => {
  const html = `<html>
  <head><title>Release notes</title></head>
  <body>
    <header><a href="/">Skip to content</a><p>Platform Solutions Pricing</p></header>
    <nav><ul><li>Home</li><li>Blog</li></ul></nav>
    <main><h1>Version 2</h1><p>The new release reads pages faster.</p></main>
    <footer><p>© 2026 Example</p></footer>
  </body>
</html>`;

  expect(buildReadableText(html)).toBe(
    'Release notes\n\nVersion 2\n\nThe new release reads pages faster.',
  );
});

test('it reads the article in place of the main element around it', () => {
  const html = `<title>Doc</title>
<main>
  <div>Files Expand file tree Copy path Blame</div>
  <article><h1>Overview</h1><p>The overview text.</p></article>
</main>`;

  expect(buildReadableText(html)).toBe('Doc\n\nOverview\n\nThe overview text.');
});

test('it keeps the header and the footer inside an article', () => {
  const html = `<title>Post</title>
<header>Site banner</header>
<article><header><h1>The headline</h1></header><p>Body text.</p><footer>By the author</footer></article>`;

  expect(buildReadableText(html)).toBe('Post\n\nThe headline\n\nBody text.\n\nBy the author');
});

test('it keeps the header and the footer inside the main element', () => {
  const html = `<title>Guide</title>
<header>Site banner</header>
<main><header><h1>Getting started</h1></header><p>Install the tool.</p><footer>Last edited today</footer></main>`;

  expect(buildReadableText(html)).toBe(
    'Guide\n\nGetting started\n\nInstall the tool.\n\nLast edited today',
  );
});

test('it reads every article on a page', () => {
  const html =
    '<title>Index</title><article><p>First post.</p></article><article><p>Second post.</p></article>';

  expect(buildReadableText(html)).toBe('Index\n\nFirst post.\n\nSecond post.');
});

test('it drops a nav and an aside inside the main element', () => {
  const html = `<title>Guide</title>
<main><nav>On this page: Setup Usage</nav><p>Install the tool.</p><aside>Related: other guides</aside></main>`;

  expect(buildReadableText(html)).toBe('Guide\n\nInstall the tool.');
});

test('it drops the nav, header, footer and aside of a page with no main or article', () => {
  const html = `<title>Plain page</title>
<header>Banner</header>
<nav>Menu</nav>
<div><p>The page text.</p><aside>Sidebar</aside><p>More text.</p></div>
<footer>Footer links</footer>`;

  expect(buildReadableText(html)).toBe('Plain page\n\nThe page text.\n\nMore text.');
});

test('it reads the rest of the page when the main element holds no text', () => {
  const html =
    '<title>App</title><nav>Menu</nav><main><div id="root"></div></main><p>Loading the app.</p>';

  expect(buildReadableText(html)).toBe('App\n\nLoading the app.');
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

test('it reads past a self-closing svg or math element', () => {
  expect(buildReadableText('<p>a<svg/>b</p><math/><p>visible</p>')).toBe('ab\n\nvisible');
});

test('it reads the body of a page that leaves out the end of its head', () => {
  expect(buildReadableText('<head><title>t</title><body><p>body text</p>')).toBe('t\n\nbody text');
});

test('it decodes a reference to a lone surrogate as the replacement character', () => {
  expect(buildReadableText('<p>&#xD800;</p>')).toBe('�');
});

test('it returns no text from a script left open', () => {
  expect(buildReadableText('<p>shown</p><script>var a = "hidden')).toBe('shown');
});
