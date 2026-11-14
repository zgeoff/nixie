import { expect, mock, test } from 'bun:test';
import type { FetchRequest } from '@heynixie/wire';
import {
  decodeFetchGuestFrame,
  decodeFetchReply,
  encodeFetchMessage,
  encodeFrame,
  makeFrameDecoder,
} from '@heynixie/wire';
import { createWebTransports } from './create-web-transports';
import { readPage } from './read-page';
import { runFetcher } from './run-fetcher';
import { buildStubResolver } from './test-utils/build-stub-resolver';
import { startTestSite } from './test-utils/start-test-site';

test('it reads one request frame, however it arrives, and writes one reply frame', async () => {
  const site = await startTestSite({ names: ['site.test'], respond: () => new Response('hello') });

  const resolver = buildStubResolver({ answers: { 'site.test': [['127.0.0.1']] } });

  const frame = encodeFrame(
    encodeFetchMessage({
      url: `https://site.test:${site.port}/`,
      limits: { bodyBytes: 100, timeoutMs: 5000, redirects: 1, textBytes: 100, imageBytes: 100 },
      deniedRanges: ['10.96.0.0/12'],
      hops: 'none',
    }),
  );

  const write = mock<(bytes: Uint8Array) => Promise<void>>(() => Promise.resolve());

  await runFetcher(
    { input: [frame.slice(0, 3), frame.slice(3, 20), frame.slice(20)], write },
    (request: FetchRequest) =>
      readPage(request.url, {
        limits: request.limits,
        checkAddress: (address) => address === '127.0.0.1',
        resolveHost: resolver.resolveHost,
        transports: createWebTransports(),
        ca: site.ca,
      }),
  );

  const written = write.mock.calls.map(([bytes]) => bytes);
  const [reply] = written;

  expect(written).toHaveLength(1);

  expect(
    makeFrameDecoder(1000)(reply ?? new Uint8Array()).map((message) => decodeFetchReply(message)),
  ).toStrictEqual([
    {
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: `https://site.test:${site.port}/`,
      status: 200,
      contentType: 'text/plain;charset=utf-8',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    },
  ]);
});

test('it throws when the input closes before a whole request arrives', () => {
  const resolver = buildStubResolver({ answers: { 'site.test': [['127.0.0.1']] } });

  const frame = encodeFrame(
    encodeFetchMessage({
      url: 'https://site.test/',
      limits: { bodyBytes: 1, timeoutMs: 1, redirects: 1, textBytes: 1, imageBytes: 1 },
      deniedRanges: [],
      hops: 'none',
    }),
  );

  expect(
    runFetcher({ input: [frame.slice(0, 10)], write: () => Promise.resolve() }, (request) =>
      readPage(request.url, {
        limits: request.limits,
        checkAddress: () => true,
        resolveHost: resolver.resolveHost,
        transports: createWebTransports(),
      }),
    ),
  ).rejects.toThrowWithMessage(Error, 'the input closed before a whole request arrived');

  expect(resolver.hosts).toStrictEqual([]);
});

test('it throws on a malformed request without reading a page', () => {
  const resolver = buildStubResolver({ answers: { 'site.test': [['127.0.0.1']] } });
  const frame = encodeFrame(new TextEncoder().encode('{"url":1}'));

  expect(
    runFetcher({ input: [frame], write: () => Promise.resolve() }, (request) =>
      readPage(request.url, {
        limits: request.limits,
        checkAddress: () => true,
        resolveHost: resolver.resolveHost,
        transports: createWebTransports(),
      }),
    ),
  ).rejects.toThrow(TypeError);

  expect(resolver.hosts).toStrictEqual([]);
});

test('it reads the request and each hop-pass through one frame reader, even from one chunk', async () => {
  const input = new Uint8Array([
    ...encodeFrame(
      encodeFetchMessage({
        url: 'https://site.test/',
        limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 100, imageBytes: 100 },
        deniedRanges: [],
        hops: 'ask' as const,
      }),
    ),
    ...encodeFrame(encodeFetchMessage({ kind: 'hop-pass' })),
  ]);

  const write = mock<(bytes: Uint8Array) => Promise<void>>(() => Promise.resolve());
  const requests: FetchRequest[] = [];

  await runFetcher({ input: [input], write }, async (request, askHop) => {
    requests.push(request);

    await askHop?.('https://site.test/next', new AbortController().signal);

    return { kind: 'failed', reason: 'done', isGated: true };
  });

  const written = write.mock.calls.flatMap(([bytes]) => makeFrameDecoder(1000)(bytes));

  expect(requests).toStrictEqual([
    {
      url: 'https://site.test/',
      limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 100, imageBytes: 100 },
      deniedRanges: [],
      hops: 'ask',
    },
  ]);

  expect(written.map((message) => decodeFetchGuestFrame(message))).toStrictEqual([
    { kind: 'hop', url: 'https://site.test/next' },
    { kind: 'failed', reason: 'done', isGated: true },
  ]);
});

test('it hands no asker to a request that is not gated', async () => {
  const frame = encodeFrame(
    encodeFetchMessage({
      url: 'https://site.test/',
      limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 100, imageBytes: 100 },
      deniedRanges: [],
      hops: 'none' as const,
    }),
  );

  const askers: unknown[] = [];

  await runFetcher({ input: [frame], write: () => Promise.resolve() }, (_request, askHop) => {
    askers.push(askHop);

    return Promise.resolve({ kind: 'failed', reason: 'done', isGated: false });
  });

  expect(askers).toStrictEqual([undefined]);
});

test('it finishes after its reply while the server still holds the input open and a read waits', async () => {
  const input = new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(
        encodeFrame(
          encodeFetchMessage({
            url: 'https://site.test/',
            limits: {
              bodyBytes: 100,
              timeoutMs: 1000,
              redirects: 2,
              textBytes: 100,
              imageBytes: 100,
            },
            deniedRanges: [],
            hops: 'ask' as const,
          }),
        ),
      );
    },
  });

  const write = mock<(bytes: Uint8Array) => Promise<void>>(() => Promise.resolve());

  await runFetcher({ input, write }, (_request, askHop) => {
    void askHop?.('https://site.test/next', new AbortController().signal).catch(() => {});

    return Promise.resolve({ kind: 'failed', reason: 'done', isGated: true });
  });

  expect(write).toHaveBeenCalledTimes(2);
});
