import { expect, test } from 'bun:test';
import { buildStubSandboxAdapter } from '@heynixie/connectors/test-utils';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { decodeFetchReply, encodeFetchMessage } from '@heynixie/wire';
import { buildFetchPageSandboxes } from './build-fetch-page-sandboxes';

function setupTest() {
  const base = buildStubSandboxAdapter(() => Promise.resolve(0));

  const adapter = buildFetchPageSandboxes(base, [
    { url: 'https://harbour-notes.test/tides', text: 'High tide at 06:42.' },
  ]);

  return {
    base,
    adapter,
    askFetcher: async (url: string) => {
      const sandbox = await adapter.create(buildMockSandboxSpec({ kind: 'fetch' }));
      const stream = await sandbox.spawn({ argv: ['fetcher'], maxMessageBytes: 100_000 });

      await stream.send(
        encodeFetchMessage({
          url,
          limits: {
            bodyBytes: 1000,
            timeoutMs: 1000,
            redirects: 1,
            textBytes: 1000,
            imageBytes: 100,
          },
          deniedRanges: [],
          hops: 'none',
        }),
      );

      const first = await stream.messages[Symbol.asyncIterator]().next();

      const message = first.done === true ? new Uint8Array() : first.value;

      return decodeFetchReply(message);
    },
  };
}

test('it answers a fetch sandbox with the canned page for the URL', async () => {
  const ctx = setupTest();

  const reply = await ctx.askFetcher('https://harbour-notes.test/tides');

  expect(reply).toStrictEqual({
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url: 'https://harbour-notes.test/tides',
    status: 200,
    contentType: 'text/html; charset=utf-8',
    text: 'High tide at 06:42.',
    links: [],
    isTruncated: false,
    blocked: null,
  });
});

test('it answers a fetch of a URL with no canned page as failed', async () => {
  const ctx = setupTest();

  const reply = await ctx.askFetcher('https://harbour-notes.test/other');

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the stub fetcher holds no page for https://harbour-notes.test/other',
    isGated: false,
  });
});

test('it gives a sandbox of any other kind to the adapter it wraps', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.adapter.create(
    buildMockSandboxSpec({ kind: 'worker', owner: 'task-1' }),
  );

  const read = await ctx.adapter.read(sandbox.id);
  const listed = await ctx.adapter.list('task-1');

  expect(ctx.base.created.map((created) => created.id)).toStrictEqual([sandbox.id]);
  expect(read?.id).toBe(sandbox.id);
  expect(listed.map((each) => each.id)).toStrictEqual([sandbox.id]);
});

test('it reads and lists a fetch sandbox it made', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.adapter.create(
    buildMockSandboxSpec({ kind: 'fetch', owner: 'web_fetch' }),
  );

  const read = await ctx.adapter.read(sandbox.id);
  const listed = await ctx.adapter.list('web_fetch');

  expect(ctx.base.created).toStrictEqual([]);
  expect(read?.id).toBe(sandbox.id);
  expect(listed.map((each) => each.id)).toStrictEqual([sandbox.id]);
});
