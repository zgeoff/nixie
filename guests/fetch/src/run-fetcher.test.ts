import { expect, mock, test } from 'bun:test';
import type { FetchRequest } from '@heynixie/wire';
import {
  decodeFetchReply,
  encodeFetchMessage,
  encodeFrame,
  makeFrameDecoder,
} from '@heynixie/wire';
import { readPage } from './read-page';
import { runFetcher } from './run-fetcher';
import { buildStubResolver } from './test-utils/build-stub-resolver';
import { startTestSite } from './test-utils/start-test-site';

test('it reads one request frame, however it arrives, and writes one reply frame', async () => {
  const site = await startTestSite({ names: ['site.test'], fetch: () => new Response('hello') });

  const resolver = buildStubResolver({ answers: { 'site.test': [['127.0.0.1']] } });

  const frame = encodeFrame(
    encodeFetchMessage({
      url: `https://site.test:${site.port}/`,
      limits: { bodyBytes: 100, timeoutMs: 5000, redirects: 1, textBytes: 100 },
      deniedRanges: ['10.96.0.0/12'],
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
      url: `https://site.test:${site.port}/`,
      status: 200,
      contentType: 'text/plain;charset=utf-8',
      text: 'hello',
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
      limits: { bodyBytes: 1, timeoutMs: 1, redirects: 1, textBytes: 1 },
      deniedRanges: [],
    }),
  );

  expect(
    runFetcher({ input: [frame.slice(0, 10)], write: () => Promise.resolve() }, (request) =>
      readPage(request.url, {
        limits: request.limits,
        checkAddress: () => true,
        resolveHost: resolver.resolveHost,
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
      }),
    ),
  ).rejects.toThrow(TypeError);

  expect(resolver.hosts).toStrictEqual([]);
});
