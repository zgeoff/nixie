import { expect, test } from 'bun:test';
import { gzipSync } from 'node:zlib';
import { defaultFetchTextBytes } from '@heynixie/wire';
import { buildReadableText } from './build-readable-text';
import { makeAddressCheck } from './make-address-check';
import { readPage } from './read-page';
import { buildStubResolver } from './test-utils/build-stub-resolver';
import { startTestSite } from './test-utils/start-test-site';

test('it returns the readable text of an HTML page over a connection to the checked address', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: () =>
      new Response(
        '<html><head><title>t</title></head><body><h1>Hello</h1><p>world</p></body></html>',
        {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        },
      ),
  });

  const resolver = buildStubResolver({ answers: { 'site.test': [['127.0.0.1']] } });

  const reply = await readPage(`https://site.test:${site.port}/page?q=1#part`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: resolver.resolveHost,
    ca: site.ca,
  });

  expect(reply).toStrictEqual({
    kind: 'page',
    url: `https://site.test:${site.port}/page?q=1`,
    status: 200,
    contentType: 'text/html; charset=utf-8',
    text: 't\n\nHello\n\nworld',
    links: [],
    isTruncated: false,
    blocked: null,
  });

  expect(resolver.hosts).toStrictEqual(['site.test']);
  expect(site.requests).toMatchObject([{ headers: { host: `site.test:${site.port}` } }]);
});

test('it connects to the checked address and never resolves the host a second time', async () => {
  const site = await startTestSite({ names: ['site.test'], respond: () => new Response('pinned') });

  const resolver = buildStubResolver({ answers: { 'site.test': [['127.0.0.1'], ['10.0.0.1']] } });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: resolver.resolveHost,
    ca: site.ca,
  });

  expect(reply).toMatchObject({ kind: 'page', status: 200 });
  expect(resolver.hosts).toStrictEqual(['site.test']);
});

test('it refuses a certificate that does not cover the host name it sent', async () => {
  const site = await startTestSite({ names: ['other.test'], respond: () => new Response('x') });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toStrictEqual({ kind: 'failed', reason: expect.toInclude('site.test') });
  expect(site.requests).toStrictEqual([]);
});

test('it refuses a site whose certificate no trusted root signed', async () => {
  const site = await startTestSite({ names: ['site.test'], respond: () => new Response('x') });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
  });

  expect(reply).toMatchObject({ kind: 'failed' });
  expect(site.requests).toStrictEqual([]);
});

test.each([
  ['http://site.test/', 'http:'],
  ['ftp://site.test/', 'ftp:'],
  ['file:///etc/passwd', 'file:'],
  ['ws://site.test/', 'ws:'],
])('it refuses %s without resolving it', async (url, scheme) => {
  const resolver = buildStubResolver({ answers: { 'site.test': [['127.0.0.1']] } });

  const reply = await readPage(url, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: () => true,
    resolveHost: resolver.resolveHost,
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: `only https URLs are fetched, not ${scheme}`,
  });

  expect(resolver.hosts).toStrictEqual([]);
});

test('it refuses text that is not a URL', async () => {
  const reply = await readPage('not a url', {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: () => true,
    resolveHost: () => Promise.resolve(['127.0.0.1']),
  });

  expect(reply).toStrictEqual({ kind: 'refused', reason: 'not a url is not a URL' });
});

test('it refuses a host when any of its A and AAAA addresses is not public', async () => {
  const site = await startTestSite({ names: ['site.test'], respond: () => new Response('x') });

  const checked: string[] = [];

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => {
      checked.push(address);

      return address === '127.0.0.1' || address === '2606:4700::1';
    },
    resolveHost: () => Promise.resolve(['127.0.0.1', '2606:4700::1', 'fd00::1']),
    ca: site.ca,
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: 'site.test resolves to fd00::1, which is not a public address',
  });

  expect(checked).toStrictEqual(['127.0.0.1', '2606:4700::1', 'fd00::1']);
  expect(site.requests).toStrictEqual([]);
});

test('it refuses a host that resolves to a private address under the production check', async () => {
  const reply = await readPage('https://site.test/', {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: makeAddressCheck([]),
    resolveHost: () => Promise.resolve(['93.184.215.14', '::ffff:169.254.169.254']),
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: 'site.test resolves to ::ffff:169.254.169.254, which is not a public address',
  });
});

test('it checks an address literal in the URL', async () => {
  const resolver = buildStubResolver({ answers: { '::ffff:a00:1': [['93.184.215.14']] } });

  const reply = await readPage('https://[::ffff:10.0.0.1]/', {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: makeAddressCheck([]),
    resolveHost: resolver.resolveHost,
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: '::ffff:a00:1 resolves to ::ffff:a00:1, which is not a public address',
  });

  expect(resolver.hosts).toStrictEqual([]);
});

test('it refuses a host that resolves to no address', async () => {
  const reply = await readPage('https://site.test/', {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: () => true,
    resolveHost: () => Promise.resolve([]),
  });

  expect(reply).toStrictEqual({ kind: 'refused', reason: 'site.test resolves to no address' });
});

test('it resolves and checks the host of each redirect before it connects', async () => {
  const site = await startTestSite({
    names: ['site.test', 'inside.test'],
    respond: () => Response.redirect('https://inside.test/admin', 302),
  });

  const resolver = buildStubResolver({
    answers: { 'site.test': [['127.0.0.1']], 'inside.test': [['10.0.0.5']] },
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: resolver.resolveHost,
    ca: site.ca,
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: 'inside.test resolves to 10.0.0.5, which is not a public address',
  });

  expect(resolver.hosts).toStrictEqual(['site.test', 'inside.test']);
  expect(site.requests).toHaveLength(1);
});

test('it refuses a redirect to an http URL', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: () => Response.redirect('http://site.test/plain', 301),
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: 'only https URLs are fetched, not http:',
  });
});

test('it follows redirects up to the limit and returns the final URL', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: (request) => {
      const step = Number(new URL(request.url).searchParams.get('step') ?? '0');

      return step < 2
        ? new Response(null, { status: 307, headers: { location: `/next?step=${step + 1}` } })
        : new Response('arrived', { headers: { 'content-type': 'text/plain' } });
    },
  });

  const reply = await readPage(`https://site.test:${site.port}/start`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 2, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toStrictEqual({
    kind: 'page',
    url: `https://site.test:${site.port}/next?step=2`,
    status: 200,
    contentType: 'text/plain',
    text: 'arrived',
    links: [],
    isTruncated: false,
    blocked: null,
  });
});

test('it resolves the links of a page against its final URL after a redirect', async () => {
  const pages: Readonly<Record<string, Response>> = {
    '/start': new Response(null, { status: 302, headers: { location: '/guides/setup/' } }),
    '/guides/setup/': new Response('<main><p><a href="../install">Install</a> first.</p></main>', {
      headers: { 'content-type': 'text/html' },
    }),
  };

  const site = await startTestSite({
    names: ['site.test'],
    respond: (request) =>
      pages[new URL(request.url).pathname] ?? new Response(null, { status: 404 }),
  });

  const reply = await readPage(`https://site.test:${site.port}/start`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toStrictEqual({
    kind: 'page',
    url: `https://site.test:${site.port}/guides/setup/`,
    status: 200,
    contentType: 'text/html',
    text: 'Install \u{E000}0\u{E001} first.',
    links: [`https://site.test:${site.port}/guides/install`],
    isTruncated: false,
    blocked: null,
  });
});

test('it cuts the list of other links before the text of the page at the text limit', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: () =>
      new Response(
        '<nav><a href="/a">First link</a> <a href="/b">Second link</a></nav><article><p>The article.</p></article>',
        { headers: { 'content-type': 'text/html' } },
      ),
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 38 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toStrictEqual({
    kind: 'page',
    url: `https://site.test:${site.port}/`,
    status: 200,
    contentType: 'text/html',
    text: 'The article.\n\nOther links on this page',
    links: [],
    isTruncated: true,
    blocked: null,
  });
});

test('it fails a page that redirects more times than the limit', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: () => new Response(null, { status: 302, headers: { location: '/again' } }),
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 3, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toStrictEqual({ kind: 'failed', reason: 'the page redirected more than 3 times' });
  expect(site.requests).toHaveLength(4);
});

test('it returns the blocked reason for a Cloudflare challenge in place of the page', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: () =>
      new Response(
        '<html><head><title>Just a moment...</title></head><body><noscript>Enable JavaScript and cookies to continue</noscript></body></html>',
        {
          status: 403,
          headers: { 'content-type': 'text/html; charset=UTF-8', 'cf-mitigated': 'challenge' },
        },
      ),
  });

  const reply = await readPage(`https://site.test:${site.port}/post`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toStrictEqual({
    kind: 'page',
    url: `https://site.test:${site.port}/post`,
    status: 403,
    contentType: 'text/html; charset=UTF-8',
    text: 'Just a moment...',
    links: [],
    isTruncated: false,
    blocked: "blocked by the site's bot protection (Cloudflare challenge)",
  });
});

test('it returns the blocked reason for a challenge page it knows by its markup', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: () =>
      new Response(
        '<html><body><script>window._cf_chl_opt = { cType: "managed" };</script><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script></body></html>',
        { status: 503, headers: { 'content-type': 'text/html' } },
      ),
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toMatchObject({
    kind: 'page',
    status: 503,
    blocked: "blocked by the site's bot protection (Cloudflare challenge)",
  });
});

test('it returns no blocked reason for a forbidden page with no challenge', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: () =>
      new Response('<p>You do not have access.</p>', {
        status: 403,
        headers: { 'content-type': 'text/html' },
      }),
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toMatchObject({
    kind: 'page',
    status: 403,
    text: 'You do not have access.',
    blocked: null,
  });
});

test('it sends a user agent that names nixie', async () => {
  const site = await startTestSite({ names: ['site.test'], respond: () => new Response('x') });

  await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(site.requests).toMatchObject([
    { headers: { 'user-agent': 'Mozilla/5.0 (compatible; nixie-fetch/1.0)' } },
  ]);
});

test('it sends no credential from the URL and no cookie a redirect set', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: (request) =>
      new URL(request.url).pathname === '/'
        ? new Response(null, {
            status: 302,
            headers: { location: '/next', 'set-cookie': 'session=1' },
          })
        : new Response('done', { headers: { 'content-type': 'text/plain' } }),
  });

  const reply = await readPage(`https://user:secret@site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toMatchObject({ kind: 'page', url: `https://site.test:${site.port}/next` });

  expect(site.requests.map((recorded) => Object.keys(recorded.headers).toSorted())).toStrictEqual([
    ['accept', 'accept-encoding', 'connection', 'host', 'user-agent'],
    ['accept', 'accept-encoding', 'connection', 'host', 'user-agent'],
  ]);
});

test('it stops at the body limit and marks the result truncated', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: () =>
      new Response('0123456789'.repeat(10_000), { headers: { 'content-type': 'text/plain' } }),
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 25, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toMatchObject({
    kind: 'page',
    text: '0123456789012345678901234',
    links: [],
    isTruncated: true,
  });
});

test('it returns a body exactly at the body limit whole', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: () => new Response('0123456789', { headers: { 'content-type': 'text/plain' } }),
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 10, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toMatchObject({ kind: 'page', text: '0123456789', isTruncated: false });
});

test('it counts the decoded bytes of a compressed body against the body limit', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: () =>
      new Response(gzipSync('a'.repeat(1_000_000)), {
        headers: { 'content-type': 'text/plain', 'content-encoding': 'gzip' },
      }),
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 100, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toMatchObject({ kind: 'page', text: 'a'.repeat(100), isTruncated: true });
});

test('it fails a page sent in a content coding it cannot read', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: () =>
      new Response('not really zstd', {
        headers: { 'content-type': 'text/plain', 'content-encoding': 'zstd' },
      }),
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: expect.toInclude('the page uses the content coding zstd'),
  });
});

test('it stops at the text limit without splitting a character and marks the result truncated', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: () =>
      new Response('ab€cd', { headers: { 'content-type': 'text/plain; charset=utf-8' } }),
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 4 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toMatchObject({ kind: 'page', text: 'ab', isTruncated: true });
});

test('it fails a fetch that passes the time limit', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: async () => {
      // the fault: the site answers well after the limit
      await Bun.sleep(800);

      return new Response('late');
    },
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 300, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toStrictEqual({ kind: 'failed', reason: 'the fetch passed 300 ms' });
});

test('it returns the page of a slow site that answers within the time limit', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: async () => {
      // the same slow site as the time limit's, under a limit it fits in
      await Bun.sleep(800);

      return new Response('late');
    },
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toMatchObject({ kind: 'page', text: 'late' });
});

test('it fails a fetch whose compressed body stalls past the time limit', async () => {
  const body = gzipSync('a'.repeat(1000));

  const site = await startTestSite({
    names: ['site.test'],
    respond: () =>
      new Response(
        new ReadableStream({
          start: async (controller) => {
            controller.enqueue(body.subarray(0, 10));

            // the fault: the body stalls well after the limit
            await Bun.sleep(800);

            controller.enqueue(body.subarray(10));
            controller.close();
          },
        }),
        { headers: { 'content-type': 'text/plain', 'content-encoding': 'gzip' } },
      ),
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 300, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toStrictEqual({ kind: 'failed', reason: 'the fetch passed 300 ms' });
});

test('it returns a compressed body that stalls and finishes within the time limit', async () => {
  const body = gzipSync('a'.repeat(1000));

  const site = await startTestSite({
    names: ['site.test'],
    respond: () =>
      new Response(
        new ReadableStream({
          start: async (controller) => {
            controller.enqueue(body.subarray(0, 10));

            // the same stall as the time limit's, under a limit it fits in
            await Bun.sleep(800);

            controller.enqueue(body.subarray(10));
            controller.close();
          },
        }),
        { headers: { 'content-type': 'text/plain', 'content-encoding': 'gzip' } },
      ),
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toMatchObject({ kind: 'page', text: 'a'.repeat(1000) });
});

test('it fails a fetch whose DNS answer passes the time limit', async () => {
  // the fault: the DNS answer comes well after the limit
  const resolver = buildStubResolver({ answers: { 'site.test': [['10.0.0.1']] }, delayMs: 300 });

  const reply = await readPage('https://site.test/', {
    limits: { bodyBytes: 1_000_000, timeoutMs: 100, redirects: 5, textBytes: 1_000_000 },
    checkAddress: () => false,
    resolveHost: resolver.resolveHost,
  });

  expect(reply).toStrictEqual({ kind: 'failed', reason: 'the fetch passed 100 ms' });
});

test('it checks a slow DNS answer that arrives within the time limit', async () => {
  // the same slow answer as the time limit's, under a limit it fits in
  const resolver = buildStubResolver({ answers: { 'site.test': [['10.0.0.1']] }, delayMs: 300 });

  const reply = await readPage('https://site.test/', {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: () => false,
    resolveHost: resolver.resolveHost,
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: 'site.test resolves to 10.0.0.1, which is not a public address',
  });
});

test('it returns a binary type with no body', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: () =>
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        headers: { 'content-type': 'image/png' },
      }),
  });

  const reply = await readPage(`https://site.test:${site.port}/a.png`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toStrictEqual({
    kind: 'page',
    url: `https://site.test:${site.port}/a.png`,
    status: 200,
    contentType: 'image/png',
    text: null,
    links: [],
    isTruncated: false,
    blocked: null,
  });
});

test('it returns another text type as it arrived', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: () =>
      new Response('{"a": "<b>"}', {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
  });

  const reply = await readPage(`https://site.test:${site.port}/data`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toMatchObject({
    kind: 'page',
    status: 404,
    text: '{"a": "<b>"}',
    links: [],
    isTruncated: false,
    blocked: null,
  });
});

test('it cuts a long article full of links to the start that fits the default text limit', async () => {
  const paragraphs = Array.from(
    { length: 228 },
    (_, index) =>
      `<p>Keeper's log ${index}: the lamp at Gannet Rock burned through the fog, as the ` +
      `<a href="https://lighthouses.example/archive/gannet-rock/logbook/volume-${index}/entry-${index}?view=full&amp;lang=en">volume ${index}</a> ` +
      `and <a href="https://lighthouses.example/archive/gannet-rock/weather/${index}/barometer-readings-and-tide-tables">its tide tables</a> record.</p>`,
  ).join('');

  const html = `<html><head><title>Gannet Rock Light</title></head><body><article>${paragraphs}</article></body></html>`;

  const site = await startTestSite({
    names: ['site.test'],
    respond: () => new Response(html, { headers: { 'content-type': 'text/html' } }),
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: {
      bodyBytes: 2_097_152,
      timeoutMs: 15_000,
      redirects: 5,
      textBytes: defaultFetchTextBytes,
    },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  if (reply.kind !== 'page' || reply.text === null) {
    throw new Error('the fetcher returned no page text');
  }

  expect(buildReadableText(html, new URL(reply.url)).text.length).toBeWithin(26_000, 30_000);
  expect(reply.isTruncated).toBeTrue();

  expect(Buffer.byteLength(reply.text)).toBeWithin(
    defaultFetchTextBytes - 1000,
    defaultFetchTextBytes + 1,
  );

  expect(reply.text).toStartWith(
    "Gannet Rock Light\n\nKeeper's log 0: the lamp at Gannet Rock burned through the fog, as the volume 0 \u{E000}0\u{E001} and its tide tables \u{E000}1\u{E001} record.",
  );

  expect(reply.links.slice(0, 2)).toStrictEqual([
    'https://lighthouses.example/archive/gannet-rock/logbook/volume-0/entry-0?view=full&lang=en',
    'https://lighthouses.example/archive/gannet-rock/weather/0/barometer-readings-and-tide-tables',
  ]);
});

test('it decodes the text in the charset the page names', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    respond: () =>
      new Response(new Uint8Array([0x63, 0x61, 0x66, 0xe9]), {
        headers: { 'content-type': 'text/plain; charset=iso-8859-1' },
      }),
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toMatchObject({ kind: 'page', text: 'café' });
});
