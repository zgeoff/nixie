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

  expect(buildReadableText(html, new URL('https://example.test/'))).toBe(
    'Example\n\nExample Domain\n\nThis domain is for use in examples [→ https://example.test/x].\nSecond line.\n\none\n\ntwo',
  );
});

test('it writes the absolute target after the text of a link with a relative href', () => {
  const html =
    '<title>Victoria line</title><main><p>Trains run every two minutes. <a href="../tube/?view=map">Back to the tube page</a></p></main>';

  expect(buildReadableText(html, new URL('https://transit.test/lines/victoria/'))).toBe(
    'Victoria line\n\nTrains run every two minutes. Back to the tube page [→ https://transit.test/lines/tube/?view=map]',
  );
});

test('it decodes the entities of an href once', () => {
  expect(
    buildReadableText(
      '<p><a href="/find?q=a&amp;page=2&amp;amp;">Next page</a></p>',
      new URL('https://search.test/find'),
    ),
  ).toBe('Next page [→ https://search.test/find?q=a&page=2&amp;]');
});

test('it lists the links of the navigation and the side panels after the article text', () => {
  const html = `<title>Bakery news</title>
<nav><a href="/">Home</a> <a href="/menu">Menu</a> <a href="https://social.test/bakery">Follow us</a></nav>
<article><p>The <a href="/bread">new loaf</a> is out.</p></article>
<aside><a href="/menu">Our menu</a> <a href="/archive#2026">Archive</a></aside>`;

  expect(buildReadableText(html, new URL('https://bakery.test/news/loaf'))).toBe(
    'Bakery news\n\nThe new loaf [→ https://bakery.test/bread] is out.\n\nOther links on this page:\n- Home [→ https://bakery.test/]\n- Menu [→ https://bakery.test/menu]\n- Follow us [→ https://social.test/bakery]\n- Archive [→ https://bakery.test/archive#2026]',
  );
});

test('it lists the links of the page outside the main content it picked', () => {
  const html = `<header><a href="/account">Sign in</a></header>
<main><div><a href="/raw">Raw file</a></div><article><p>The text.</p></article></main>
<footer><a href="/terms">Terms</a></footer>`;

  expect(buildReadableText(html, new URL('https://code.test/file'))).toBe(
    'The text.\n\nOther links on this page:\n- Sign in [→ https://code.test/account]\n- Raw file [→ https://code.test/raw]\n- Terms [→ https://code.test/terms]',
  );
});

test('it leaves a target the main content shows out of the list of other links', () => {
  const html =
    '<nav><a href="/guide">Guide</a> <a href="/faq">FAQ</a></nav><main><p>Read the <a href="/guide">guide</a>.</p></main>';

  expect(buildReadableText(html, new URL('https://docs.test/'))).toBe(
    'Read the guide [→ https://docs.test/guide].\n\nOther links on this page:\n- FAQ [→ https://docs.test/faq]',
  );
});

test('it lists at most 20 other links', () => {
  const links = Array.from({ length: 25 }, (_, index) => `<a href="/p${index}">P${index}</a>`);
  const html = `<nav>${links.join(' ')}</nav><main><p>Body.</p></main>`;

  expect(buildReadableText(html, new URL('https://many.test/'))).toBe(
    `Body.\n\nOther links on this page:\n${Array.from({ length: 20 }, (_, index) => `- P${index} [→ https://many.test/p${index}]`).join('\n')}`,
  );
});

test('it writes a link with no text as its target alone', () => {
  expect(
    buildReadableText(
      '<nav><a href="/home"><img src="logo.png"></a></nav><p>Text.</p>',
      new URL('https://shop.test/'),
    ),
  ).toBe('Text.\n\nOther links on this page:\n- [→ https://shop.test/home]');
});

test('it keeps only the text of a script link, a fragment link and a link to another scheme', () => {
  const html = `<nav><a href="javascript:void(0)">Open menu</a> <a href="#top">Top</a> <a href="mailto:hi@mail.test">Mail</a></nav>
<main><p><a href="JavaScript:alert(1)">Run</a>, <a href=" #part-2 ">jump</a> and <a href="/page#intro">intro</a>.</p></main>`;

  expect(buildReadableText(html, new URL('https://plain.test/page'))).toBe('Run, jump and intro.');
});

test('it returns the title and the main text of a page with a nav, a header and a footer', () => {
  const html = `<html>
  <head><title>Release notes</title></head>
  <body>
    <header><a href="/#content">Skip to content</a><p>Platform Solutions Pricing</p></header>
    <nav><ul><li>Home</li><li>Blog</li></ul></nav>
    <main><h1>Version 2</h1><p>The new release reads pages faster.</p></main>
    <footer><p>© 2026 Example</p></footer>
  </body>
</html>`;

  expect(buildReadableText(html, new URL('https://example.test/'))).toBe(
    'Release notes\n\nVersion 2\n\nThe new release reads pages faster.',
  );
});

test('it reads the article in place of the main element around it', () => {
  const html = `<title>Doc</title>
<main>
  <div>Files Expand file tree Copy path Blame</div>
  <article><h1>Overview</h1><p>The overview text.</p></article>
</main>`;

  expect(buildReadableText(html, new URL('https://example.test/'))).toBe(
    'Doc\n\nOverview\n\nThe overview text.',
  );
});

test('it keeps the header and the footer inside an article', () => {
  const html = `<title>Post</title>
<header>Site banner</header>
<article><header><h1>The headline</h1></header><p>Body text.</p><footer>By the author</footer></article>`;

  expect(buildReadableText(html, new URL('https://example.test/'))).toBe(
    'Post\n\nThe headline\n\nBody text.\n\nBy the author',
  );
});

test('it keeps adjacent articles that hold direct text apart', () => {
  expect(
    buildReadableText(
      '<article>First post.</article><article>Second post.</article>',
      new URL('https://example.test/'),
    ),
  ).toBe('First post.\n\nSecond post.');
});

test('it keeps the header and the footer inside the main element', () => {
  const html = `<title>Guide</title>
<header>Site banner</header>
<main><header><h1>Getting started</h1></header><p>Install the tool.</p><footer>Last edited today</footer></main>`;

  expect(buildReadableText(html, new URL('https://example.test/'))).toBe(
    'Guide\n\nGetting started\n\nInstall the tool.\n\nLast edited today',
  );
});

test('it reads every article on a page', () => {
  const html =
    '<title>Index</title><article><p>First post.</p></article><article><p>Second post.</p></article>';

  expect(buildReadableText(html, new URL('https://example.test/'))).toBe(
    'Index\n\nFirst post.\n\nSecond post.',
  );
});

test('it drops a nav and an aside inside the main element', () => {
  const html = `<title>Guide</title>
<main><nav>On this page: Setup Usage</nav><p>Install the tool.</p><aside>Related: other guides</aside></main>`;

  expect(buildReadableText(html, new URL('https://example.test/'))).toBe(
    'Guide\n\nInstall the tool.',
  );
});

test('it drops the nav, header, footer and aside of a page with no main or article', () => {
  const html = `<title>Plain page</title>
<header>Banner</header>
<nav>Menu</nav>
<div><p>The page text.</p><aside>Sidebar</aside><p>More text.</p></div>
<footer>Footer links</footer>`;

  expect(buildReadableText(html, new URL('https://example.test/'))).toBe(
    'Plain page\n\nThe page text.\n\nMore text.',
  );
});

test('it reads the rest of the page when the main element holds no text', () => {
  const html =
    '<title>App</title><nav>Menu</nav><main><div id="root"></div></main><p>Loading the app.</p>';

  expect(buildReadableText(html, new URL('https://example.test/'))).toBe('App\n\nLoading the app.');
});

test('it decodes numeric and common named entities', () => {
  expect(
    buildReadableText(
      '<p>a &amp; b &lt;c&gt; &#169; &#x2014; &rsquo;</p>',
      new URL('https://example.test/'),
    ),
  ).toBe('a & b <c> © — ’');
});

test('it keeps a named reference it does not know as written', () => {
  expect(buildReadableText('<p>&unknownx;</p>', new URL('https://example.test/'))).toBe(
    '&unknownx;',
  );
});

test('it reads the text of a page cut off inside a tag', () => {
  expect(buildReadableText('<p>first</p><p>second <scr', new URL('https://example.test/'))).toBe(
    'first\n\nsecond',
  );
});

test('it reads past a self-closing svg or math element', () => {
  expect(
    buildReadableText('<p>a<svg/>b</p><math/><p>visible</p>', new URL('https://example.test/')),
  ).toBe('ab\n\nvisible');
});

test('it reads the body of a page that leaves out the end of its head', () => {
  expect(
    buildReadableText(
      '<head><title>t</title><body><p>body text</p>',
      new URL('https://example.test/'),
    ),
  ).toBe('t\n\nbody text');
});

test('it decodes a reference to a lone surrogate as the replacement character', () => {
  expect(buildReadableText('<p>&#xD800;</p>', new URL('https://example.test/'))).toBe('�');
});

test('it returns no text from a script left open', () => {
  expect(
    buildReadableText('<p>shown</p><script>var a = "hidden', new URL('https://example.test/')),
  ).toBe('shown');
});
