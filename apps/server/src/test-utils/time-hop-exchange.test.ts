import { expect, onTestFinished, test } from 'bun:test';
import { startFetchSandbox } from '@heynixie/connectors';
import { buildStubSandboxAdapter, makeStubFetcher } from '@heynixie/connectors/test-utils';
import { timeHopExchange } from './time-hop-exchange';

function setupTest() {
  const lines: string[] = [];

  const adapter = timeHopExchange(
    buildStubSandboxAdapter(
      makeStubFetcher(
        (request) => ({
          kind: 'page',
          retryAfterMs: null,
          isGated: true,
          url: request.url,
          status: 200,
          contentType: 'text/plain',
          text: 'hello',
          links: [],
          isTruncated: false,
          blocked: null,
        }),
        { hops: ['https://www.example.com/b', 'https://cdn.example.net/c'] },
      ),
    ),
    (line) => lines.push(line),
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => {
    fetchSandbox.stop();
  });

  return { lines, fetchSandbox };
}

test('it reports the time from each hop frame to the hop-pass that answers it', async () => {
  const ctx = setupTest();

  const reply = await ctx.fetchSandbox.readPage('https://example.com/a', {
    scanHop: () => Promise.resolve({ kind: 'pass' }),
  });

  expect(reply.kind).toBe('page');

  expect(ctx.lines).toStrictEqual([
    expect.stringMatching(/^hop 1 passed [\d.]+ ms after its frame$/u),
    expect.stringMatching(/^hop 2 passed [\d.]+ ms after its frame$/u),
  ]);
});

test('it reports the time from a hop frame to the stop that refuses it', async () => {
  const ctx = setupTest();

  const reply = await ctx.fetchSandbox.readPage('https://example.com/a', {
    scanHop: () => Promise.resolve({ kind: 'refuse', reason: 'that URL holds a secret' }),
  });

  expect(reply.kind).toBe('refused');

  expect(ctx.lines).toStrictEqual([
    expect.stringMatching(/^hop 1 refused [\d.]+ ms after its frame$/u),
  ]);
});
