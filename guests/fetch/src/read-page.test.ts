import { expect, mock, test } from 'bun:test';
import { gzipSync } from 'node:zlib';
import { makeAddressCheck } from './make-address-check';
import { readPage } from './read-page';
import { startTestSite } from './test-utils/start-test-site';

test('it returns the readable text of an HTML page over a connection to the checked address', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    fetch: () =>
      new Response(
        '<html><head><title>t</title></head><body><h1>Hello</h1><p>world</p></body></html>',
        {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        },
      ),
  });
  const resolveHost = mock(() => Promise.resolve(['127.0.0.1']));

  const reply = await readPage(`https://site.test:${site.port}/page?q=1#part`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost,
    ca: site.ca,
  });

  expect(reply).toStrictEqual({
    kind: 'page',
    url: `https://site.test:${site.port}/page?q=1`,
    status: 200,
    contentType: 'text/html; charset=utf-8',
    text: 't\n\nHello\n\nworld',
    isTruncated: false,
  });
  expect(resolveHost).toHaveBeenCalledExactlyOnceWith('site.test');
  expect(site.requests).toMatchObject([{ headers: { host: `site.test:${site.port}` } }]);
});

test('it connects to the checked address and never resolves the host a second time', async () => {
  const site = await startTestSite({ names: ['site.test'], fetch: () => new Response('pinned') });
  const answers = [['127.0.0.1'], ['10.0.0.1']];
  const resolveHost = mock(() => Promise.resolve(answers.shift() ?? []));

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost,
    ca: site.ca,
  });

  expect(reply).toMatchObject({ kind: 'page', status: 200 });
  expect(resolveHost).toHaveBeenCalledOnce();
  expect(answers).toStrictEqual([['10.0.0.1']]);
});

test('it refuses a certificate that does not cover the host name it sent', async () => {
  const site = await startTestSite({ names: ['other.test'], fetch: () => new Response('x') });

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
  const site = await startTestSite({ names: ['site.test'], fetch: () => new Response('x') });

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
  const resolveHost = mock(() => Promise.resolve(['127.0.0.1']));

  const reply = await readPage(url, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: () => true,
    resolveHost,
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: `only https URLs are fetched, not ${scheme}`,
  });
  expect(resolveHost).not.toHaveBeenCalled();
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
  const site = await startTestSite({ names: ['site.test'], fetch: () => new Response('x') });
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
  const resolveHost = mock(() => Promise.resolve(['93.184.215.14']));

  const reply = await readPage('https://[::ffff:10.0.0.1]/', {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: makeAddressCheck([]),
    resolveHost,
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: '::ffff:a00:1 resolves to ::ffff:a00:1, which is not a public address',
  });
  expect(resolveHost).not.toHaveBeenCalled();
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
    fetch: () => Response.redirect('https://inside.test/admin', 302),
  });
  const answers: Readonly<Record<string, readonly string[]>> = {
    'site.test': ['127.0.0.1'],
    'inside.test': ['10.0.0.5'],
  };
  const resolveHost = mock((host: string) => Promise.resolve(answers[host] ?? []));

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 5000, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost,
    ca: site.ca,
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: 'inside.test resolves to 10.0.0.5, which is not a public address',
  });
  expect(resolveHost.mock.calls).toStrictEqual([['site.test'], ['inside.test']]);
  expect(site.requests).toHaveLength(1);
});

test('it refuses a redirect to an http URL', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    fetch: () => Response.redirect('http://site.test/plain', 301),
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
    fetch: (request) => {
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
    isTruncated: false,
  });
});

test('it fails a page that redirects more times than the limit', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    fetch: () => new Response(null, { status: 302, headers: { location: '/again' } }),
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

test('it sends no credential from the URL and no cookie a redirect set', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    fetch: (request) =>
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
    fetch: () =>
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
    isTruncated: true,
  });
});

test('it returns a body exactly at the body limit whole', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    fetch: () => new Response('0123456789', { headers: { 'content-type': 'text/plain' } }),
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
    fetch: () =>
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

test('it stops at the text limit without splitting a character and marks the result truncated', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    fetch: () =>
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
    fetch: async () => {
      await Bun.sleep(2000);
      return new Response('late');
    },
  });

  const reply = await readPage(`https://site.test:${site.port}/`, {
    limits: { bodyBytes: 1_000_000, timeoutMs: 200, redirects: 5, textBytes: 1_000_000 },
    checkAddress: (address) => address === '127.0.0.1',
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    ca: site.ca,
  });

  expect(reply).toStrictEqual({ kind: 'failed', reason: 'the fetch passed 200 ms' });
});

test('it fails a fetch whose DNS answer passes the time limit', async () => {
  const reply = await readPage('https://site.test/', {
    limits: { bodyBytes: 1_000_000, timeoutMs: 100, redirects: 5, textBytes: 1_000_000 },
    checkAddress: () => true,
    resolveHost: () => Promise.withResolvers<readonly string[]>().promise,
  });

  expect(reply).toStrictEqual({ kind: 'failed', reason: 'the fetch passed 100 ms' });
});

test('it returns a binary type with no body', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    fetch: () =>
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
    isTruncated: false,
  });
});

test('it returns another text type as it arrived', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    fetch: () =>
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
    isTruncated: false,
  });
});

test('it decodes the text in the charset the page names', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    fetch: () =>
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
