import { expect, onTestFinished, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { waitForCondition } from '@heynixie/testing';
import type { FetchReply } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import type { PageView } from './parse-web-fetch-request';
import { readWebFetchPage } from './read-web-fetch-page';
import { removeWebFetchThread } from './remove-web-fetch-thread';
import { runPageFetch } from './run-page-fetch';
import { startFetchSandbox } from './start-fetch-sandbox';
import { buildMockPageReply } from './test-utils/build-mock-page-reply';
import { buildStubSandboxAdapter } from './test-utils/build-stub-sandbox-adapter';
import { makeStubFetcher } from './test-utils/make-stub-fetcher';
import { startTestLog } from './test-utils/start-test-log';

interface SetupOptions {
  // the sandbox holds its answer to this URL until `release` runs
  readonly holdURL?: string;
}

async function setupTest(answer: (url: string) => FetchReply, options: SetupOptions = {}) {
  const log = await startTestLog();

  const requestedURLs: string[] = [];
  const hold = Promise.withResolvers<void>();

  const fetchSandbox = startFetchSandbox({
    adapter: buildStubSandboxAdapter((stdin, stdout) => {
      const held = new WritableStream<Uint8Array>({
        write: async (chunk) => {
          if (requestedURLs.at(-1) === options.holdURL) {
            await hold.promise;
          }

          await stdout.write(chunk);
        },
      }).getWriter();

      return makeStubFetcher((request) => {
        requestedURLs.push(request.url);

        return answer(request.url);
      })(stdin, held);
    }),
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const session = { sessionKey: 'session-a', thread: 'conversation', invalidatedThrough: 0 };
  const view: PageView = { kind: 'part', part: 1 };

  return {
    log,
    requestedURLs,
    release: () => {
      hold.resolve();
    },
    runFetch: (url: string) =>
      runPageFetch(
        {
          log,
          readPage: fetchSandbox.readPage,
          session,
          limits: { textBytes: 20_000, linkPathChars: 24, storeBytes: 20_971_520 },
          imageLongEdge: 1568,
          reserveImages: null,
        },
        url,
        view,
      ),
    readStored: (pageID: string) => readWebFetchPage(log, { sessionKey: 'session-a', pageID }),
  };
}

test('it fetches the rewritten URL for a url call to a known site, and returns it as the result url', async () => {
  const ctx = await setupTest((url) =>
    buildMockPageReply(url, { contentType: 'application/json', text: '{"name":"reefkit"}' }),
  );

  const outcome = await ctx.runFetch('https://pypi.org/project/reefkit/');

  expect(ctx.requestedURLs).toStrictEqual(['https://pypi.org/pypi/reefkit/json']);

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      url: 'https://pypi.org/pypi/reefkit/json',
      status: 200,
      contentType: 'application/json',
      page: expect.any(String),
      part: 1,
      parts: 1,
      text: '{"name":"reefkit"}',
      isTruncated: false,
      blocked: null,
    },
  });
});

test.each([
  ['a 404', 404, null],
  ['a 429', 429, null],
  ['a 503', 503, null],
  ['a 403 with a retry wait', 403, 3000],
])(
  'it fetches the named URL and stores its page after %s on the rewritten URL',
  async (_name, status, retryAfterMs) => {
    const ctx = await setupTest((url) =>
      url === 'https://www.npmjs.com/package/tidepool'
        ? buildMockPageReply(url, { contentType: 'text/html', text: 'The tidepool package page' })
        : buildMockPageReply(url, { status, retryAfterMs, text: 'the failure body' }),
    );

    const outcome = await ctx.runFetch('https://www.npmjs.com/package/tidepool');

    expect(ctx.requestedURLs).toStrictEqual([
      'https://registry.npmjs.org/tidepool/latest',
      'https://www.npmjs.com/package/tidepool',
    ]);

    invariant(outcome.status === 'ok' && typeof outcome.result['page'] === 'string');

    expect(outcome.result).toMatchObject({
      url: 'https://www.npmjs.com/package/tidepool',
      status: 200,
      text: 'The tidepool package page',
    });

    const stored = await ctx.readStored(outcome.result['page']);

    expect(stored).toMatchObject({
      url: 'https://www.npmjs.com/package/tidepool',
      parts: ['The tidepool package page'],
    });
  },
);

test('it fetches nothing more after a 200 on the rewritten URL', async () => {
  const ctx = await setupTest((url) => buildMockPageReply(url, { retryAfterMs: 3000 }));

  await ctx.runFetch('https://github.com/acme-labs/tidal-notes/blob/main/notes.txt');

  expect(ctx.requestedURLs).toStrictEqual([
    'https://raw.githubusercontent.com/acme-labs/tidal-notes/main/notes.txt',
  ]);
});

test('it fetches the named URL once when a rule rewrites nothing', async () => {
  const ctx = await setupTest((url) => buildMockPageReply(url, { status: 404, text: 'Not here' }));

  await ctx.runFetch('https://example.com/docs?page=2');

  expect(ctx.requestedURLs).toStrictEqual(['https://example.com/docs?page=2']);
});

test('it returns the rate-limit reply of the named URL, with no third fetch', async () => {
  const ctx = await setupTest((url) =>
    url === 'https://pypi.org/project/reefkit/'
      ? buildMockPageReply(url, { status: 429, text: 'Slow down' })
      : buildMockPageReply(url, { status: 404, text: 'Not found' }),
  );

  const outcome = await ctx.runFetch('https://pypi.org/project/reefkit/');

  expect(ctx.requestedURLs).toStrictEqual([
    'https://pypi.org/pypi/reefkit/json',
    'https://pypi.org/project/reefkit/',
  ]);

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { url: 'https://pypi.org/project/reefkit/', status: 429, text: 'Slow down' },
  });
});

test('it sets off no fallback for a 403 with a blocked reason on the rewritten URL', async () => {
  const ctx = await setupTest((url) =>
    buildMockPageReply(url, {
      status: 403,
      retryAfterMs: 3000,
      contentType: 'text/html',
      text: 'Just a moment',
      blocked: 'cloudflare challenge',
    }),
  );

  await ctx.runFetch('https://en.wikipedia.org/wiki/Lighthouse');

  expect(ctx.requestedURLs).toStrictEqual([
    'https://en.wikipedia.org/w/rest.php/v1/page/Lighthouse/html',
  ]);
});

test('it sets off no fallback for a failed reply on the rewritten URL, and returns its reason', async () => {
  const ctx = await setupTest(() => ({
    kind: 'failed',
    reason: 'the page timed out',
    isGated: false,
  }));

  const outcome = await ctx.runFetch('https://pypi.org/project/reefkit/');

  expect(ctx.requestedURLs).toHaveLength(1);
  expect(outcome).toStrictEqual({ status: 'error', message: 'the page timed out' });
});

test('it stores no row when a forget ends the session during the fetch of the named URL', async () => {
  const ctx = await setupTest(
    (url) =>
      url === 'https://pypi.org/pypi/reefkit/json'
        ? buildMockPageReply(url, { status: 404, text: 'Not found' })
        : buildMockPageReply(url, { contentType: 'text/html', text: 'Reefkit home' }),
    { holdURL: 'https://pypi.org/project/reefkit/' },
  );

  const running = ctx.runFetch('https://pypi.org/project/reefkit/');

  await waitForCondition(() => ctx.requestedURLs.length === 2);

  await writeRecords(ctx.log, [
    {
      kind: 'model.session_invalidated',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { itemID: '00000000-0000-4000-8000-000000000001' },
    },
  ]);

  await removeWebFetchThread(ctx.log, 'conversation');

  ctx.release();

  const outcome = await running;

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'the session ended while the page was fetched, so fetch it again by its url',
  });
});
