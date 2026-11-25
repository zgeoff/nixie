import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import {
  decodeFetchReply,
  encodeFetchMessage,
  encodeFrame,
  makeFrameDecoder,
} from '@heynixie/wire';
import invariant from 'tiny-invariant';

test('it answers a page whose text holds the bytes the URL names', async () => {
  const child = Bun.spawn([process.execPath, join(import.meta.dir, 'run-stub-fetcher.ts')], {
    stdin: encodeFrame(
      encodeFetchMessage({
        url: 'https://pages.test/files/12',
        limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 1, textBytes: 100, imageBytes: 100 },
        deniedRanges: [],
        hops: 'none',
      }),
    ),
    stdout: 'pipe',
  });

  const stdout = await new Response(child.stdout).bytes();

  const replies = makeFrameDecoder(100_000)(stdout).map((message) => decodeFetchReply(message));

  expect(replies).toStrictEqual([
    {
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: 'https://pages.test/files/12',
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      text: 'xxxxxxxxxxxx',
      links: [],
      isTruncated: false,
      blocked: null,
    },
  ]);
});

test('it answers a PNG of the size the URL names', async () => {
  const child = Bun.spawn([process.execPath, join(import.meta.dir, 'run-stub-fetcher.ts')], {
    stdin: encodeFrame(
      encodeFetchMessage({
        url: 'https://charts.test/images/40x30.png',
        limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 1, textBytes: 100, imageBytes: 4096 },
        deniedRanges: [],
        hops: 'none',
      }),
    ),
    stdout: 'pipe',
  });

  const stdout = await new Response(child.stdout).bytes();

  const [reply] = makeFrameDecoder(100_000)(stdout).map((message) => decodeFetchReply(message));

  expect(reply).toStrictEqual({
    kind: 'image',
    retryAfterMs: null,
    isGated: false,
    url: 'https://charts.test/images/40x30.png',
    status: 200,
    contentType: 'image/png',
    base64: expect.any(String),
  });

  invariant(reply?.kind === 'image');

  expect(new Bun.Image(Buffer.from(reply.base64, 'base64')).metadata()).resolves.toStrictEqual({
    width: 40,
    height: 30,
    format: 'png',
  });
});

test("it answers no image, marked truncated, past the request's image limit, as the fetcher does", async () => {
  const child = Bun.spawn([process.execPath, join(import.meta.dir, 'run-stub-fetcher.ts')], {
    stdin: encodeFrame(
      encodeFetchMessage({
        url: 'https://charts.test/images/40x30.png',
        limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 1, textBytes: 100, imageBytes: 10 },
        deniedRanges: [],
        hops: 'none',
      }),
    ),
    stdout: 'pipe',
  });

  const stdout = await new Response(child.stdout).bytes();

  const replies = makeFrameDecoder(100_000)(stdout).map((message) => decodeFetchReply(message));

  expect(replies).toStrictEqual([
    {
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: 'https://charts.test/images/40x30.png',
      status: 200,
      contentType: 'image/png',
      text: null,
      links: [],
      isTruncated: true,
      blocked: null,
    },
  ]);
});

test("it cuts the text at the request's text limit and marks it truncated, as the fetcher does", async () => {
  const child = Bun.spawn([process.execPath, join(import.meta.dir, 'run-stub-fetcher.ts')], {
    stdin: encodeFrame(
      encodeFetchMessage({
        url: 'https://pages.test/files/12',
        limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 1, textBytes: 5, imageBytes: 100 },
        deniedRanges: [],
        hops: 'none',
      }),
    ),
    stdout: 'pipe',
  });

  const stdout = await new Response(child.stdout).bytes();

  const replies = makeFrameDecoder(100_000)(stdout).map((message) => decodeFetchReply(message));

  expect(replies).toMatchObject([{ kind: 'page', text: 'xxxxx', isTruncated: true }]);
});

test('it reads the HTML of a request with the real guest and makes no request', async () => {
  const child = Bun.spawn([process.execPath, join(import.meta.dir, 'run-stub-fetcher.ts')], {
    stdin: encodeFrame(
      encodeFetchMessage({
        url: 'about:blank',
        limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 0, textBytes: 1000, imageBytes: 0 },
        deniedRanges: [],
        hops: 'none',
        html: '<p>Tap <a href="https://pier.test/reset">Reset</a>.</p>',
      }),
    ),
    stdout: 'pipe',
  });

  const stdout = await new Response(child.stdout).bytes();

  const replies = makeFrameDecoder(100_000)(stdout).map((message) => decodeFetchReply(message));

  expect(replies).toMatchObject([{ kind: 'page', links: ['https://pier.test/reset'] }]);
});

function setupTest() {
  return {
    startSite: (respond: (url: URL) => Response) => {
      const site = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        routes: { '/*': (request) => respond(new URL(request.url)) },
      });

      onTestFinished(() => site.stop(true));

      return `http://127.0.0.1:${String(site.port)}/`;
    },
  };
}

test('it passes a body request on to the real reader of the test site', async () => {
  const ctx = setupTest();
  const siteURL = ctx.startSite(() => Response.json({ high: '14:05' }));

  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, 'run-stub-fetcher.ts'), siteURL],
    {
      stdin: encodeFrame(
        encodeFetchMessage({
          url: 'https://tides.test/today',
          limits: { bodyBytes: 100, timeoutMs: 5000, redirects: 3, textBytes: 100, imageBytes: 0 },
          deniedRanges: [],
          hops: 'none',
          mode: { kind: 'body' },
        }),
      ),
      stdout: 'pipe',
    },
  );

  const stdout = await new Response(child.stdout).bytes();

  const replies = makeFrameDecoder(100_000)(stdout).map((message) => decodeFetchReply(message));

  expect(replies).toMatchObject([{ kind: 'body', status: 200, text: '{"high":"14:05"}' }]);
});
