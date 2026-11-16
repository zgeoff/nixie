import { expect, onTestFinished, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import type { FetchReply } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { makeFetchBackoff } from '../fetch/make-fetch-backoff';
import { startFetchSandbox } from '../fetch/start-fetch-sandbox';
import { buildMockPageReply } from '../test-utils/build-mock-page-reply';
import { buildStubSandboxAdapter } from '../test-utils/build-stub-sandbox-adapter';
import { makeStubFetcher } from '../test-utils/make-stub-fetcher';
import { startTestLog } from '../test-utils/start-test-log';
import type { PageView } from '../utils/parse-web-fetch-request';
import { readWebFetchPage } from '../web/read-web-fetch-page';
import { removeWebFetchThread } from '../web/remove-web-fetch-thread';
import { runPageFetch } from './run-page-fetch';
import type { SecretScanSetup } from './secret-scan';

interface SetupOptions {
  // the sandbox holds its answer to this URL until `release` runs
  readonly holdURL?: string;

  // how long a stored page answers; the cache is off when absent
  readonly cacheMs?: number;

  // replaces the scan that finds nothing
  readonly secretScan?: Partial<SecretScanSetup>;
}

async function setupTest(answer: (url: string) => FetchReply, options: SetupOptions = {}) {
  const requestedURLs: string[] = [];
  const hold = Promise.withResolvers<void>();
  const clock = buildTestClock(1_000_000);

  const log = await startTestLog(clock);

  const backoff = makeFetchBackoff({ backoffMs: 30_000, backoffCapMs: 300_000, clock });

  const adapter = buildStubSandboxAdapter((stdin, stdout) => {
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
  });

  const fetchSandbox = startFetchSandbox({
    adapter,
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
    clock,
    backoff,
    adapter,
    requestedURLs,
    release: () => {
      hold.resolve();
    },
    runFetch: (
      url: string,
      fetchOptions: {
        readonly fresh?: boolean;
        readonly sessionKey?: string;
        readonly findSecret?: SecretScanSetup['findSecret'];
      } = {},
    ) =>
      runPageFetch(
        {
          log,
          readPage: fetchSandbox.readPage,
          secretScan: {
            findSecret: fetchOptions.findSecret ?? (() => null),
            isOwnerTyped: () => Promise.resolve(false),
            run: {
              runID: 'run-1',
              thread: 'conversation',
              logThread: 'conversation',
              tools: [],
              model: { model: 'model-a', profile: 'chat-direct' },
            },
            logger: () => {},
            typedURLCovers: 'redirects',
            ...options.secretScan,
          },
          session: { ...session, sessionKey: fetchOptions.sessionKey ?? session.sessionKey },
          limits: { textBytes: 20_000, linkPathChars: 24, storeBytes: 20_971_520 },
          imageLongEdge: 1568,
          backoff,
          backoffWaitMs: 5000,
          cacheMs: options.cacheMs ?? 0,
          clock,
          reserveImages: null,
        },
        url,
        view,
        fetchOptions.fresh ?? false,
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
      isCached: false,
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
    isGated: true,
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

test('it refuses the next fetch of a host that answered 429 with a wait, and fetches another host', async () => {
  const ctx = await setupTest((url) =>
    url.startsWith('https://example.com/')
      ? buildMockPageReply(url, { status: 429, retryAfterMs: 60_000, text: 'Slow down' })
      : buildMockPageReply(url, { contentType: 'text/html', text: 'Open page' }),
  );

  await ctx.runFetch('https://example.com/a');

  const paused = await ctx.runFetch('https://example.com/b');
  const other = await ctx.runFetch('https://example.org/a');

  expect(paused).toStrictEqual({
    status: 'error',
    message: 'example.com asked for a pause, so fetch it again in 60 seconds',
  });

  expect(other).toMatchObject({ status: 'ok', result: { url: 'https://example.org/a' } });
  expect(ctx.requestedURLs).toStrictEqual(['https://example.com/a', 'https://example.org/a']);
});

test('it returns the rate-limit reply of a URL with no rewrite', async () => {
  const ctx = await setupTest((url) =>
    buildMockPageReply(url, { status: 429, retryAfterMs: 60_000, text: 'Slow down' }),
  );

  const outcome = await ctx.runFetch('https://example.com/a');

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { url: 'https://example.com/a', status: 429, text: 'Slow down' },
  });
});

test('it pauses both the final host and the sent host after a redirect', async () => {
  const ctx = await setupTest(() =>
    buildMockPageReply('https://www.example.org/b', { status: 429, retryAfterMs: 60_000 }),
  );

  await ctx.runFetch('https://example.com/a');

  const sent = await ctx.runFetch('https://example.com/c');
  const final = await ctx.runFetch('https://www.example.org/c');

  expect(sent).toStrictEqual({
    status: 'error',
    message: 'example.com asked for a pause, so fetch it again in 60 seconds',
  });

  expect(final).toStrictEqual({
    status: 'error',
    message: 'www.example.org asked for a pause, so fetch it again in 60 seconds',
  });
});

test('it waits on the clock for a pause of backoff_wait_ms or less before it fetches', async () => {
  const ctx = await setupTest((url) =>
    buildMockPageReply(url, { status: 429, retryAfterMs: 5000 }),
  );

  await ctx.runFetch('https://example.com/a');

  const running = ctx.runFetch('https://example.com/b');

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  expect(ctx.requestedURLs).toStrictEqual(['https://example.com/a']);

  ctx.clock.advance(5000);

  await running;

  expect(ctx.requestedURLs).toStrictEqual(['https://example.com/a', 'https://example.com/b']);
});

test('it ends with the pause error, rounded up to whole seconds, for a pause past backoff_wait_ms', async () => {
  const ctx = await setupTest((url) =>
    buildMockPageReply(url, { status: 429, retryAfterMs: 42_000 }),
  );

  await ctx.runFetch('https://example.com/a');

  ctx.clock.advance(500);

  const outcome = await ctx.runFetch('https://example.com/b');

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'example.com asked for a pause, so fetch it again in 42 seconds',
  });

  expect(ctx.clock.countSleepers()).toBe(0);
});

test('it fetches again once a pause has ended', async () => {
  const ctx = await setupTest((url) =>
    buildMockPageReply(url, { status: 429, retryAfterMs: 42_000 }),
  );

  await ctx.runFetch('https://example.com/a');

  ctx.clock.advance(42_000);

  await ctx.runFetch('https://example.com/b');

  expect(ctx.requestedURLs).toStrictEqual(['https://example.com/a', 'https://example.com/b']);
});

test('it pauses a host for backoff_ms when a 429 names no wait', async () => {
  const ctx = await setupTest((url) => buildMockPageReply(url, { status: 429 }));

  await ctx.runFetch('https://example.com/a');

  expect(ctx.backoff.readPause('example.com')).toBe(30_000);
});

test('it returns the named URL page and pauses the host of a rewritten URL that answers 403 with a spent limit', async () => {
  const ctx = await setupTest((url) =>
    url === 'https://www.npmjs.com/package/tidepool'
      ? buildMockPageReply(url, { contentType: 'text/html', text: 'The tidepool package page' })
      : buildMockPageReply(url, { status: 403, retryAfterMs: 60_000, text: 'Limit spent' }),
  );

  const outcome = await ctx.runFetch('https://www.npmjs.com/package/tidepool');

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { url: 'https://www.npmjs.com/package/tidepool', text: 'The tidepool package page' },
  });

  expect(ctx.backoff.readPause('registry.npmjs.org')).toBe(60_000);
  expect(ctx.backoff.readPause('www.npmjs.com')).toBe(0);
});

test('it sends nothing to a rewritten URL whose host is paused, and starts 1 sandbox for the named URL', async () => {
  const ctx = await setupTest((url) =>
    buildMockPageReply(url, { contentType: 'text/html', text: 'The tidepool package page' }),
  );

  ctx.backoff.setPause('registry.npmjs.org', 60_000);

  const outcome = await ctx.runFetch('https://www.npmjs.com/package/tidepool');

  expect(ctx.requestedURLs).toStrictEqual(['https://www.npmjs.com/package/tidepool']);
  expect(ctx.adapter.created).toHaveLength(1);
  expect(outcome).toMatchObject({ status: 'ok', result: { text: 'The tidepool package page' } });
});

test('it pauses the host of a 200 that carries a wait, and stores the rewritten URL page', async () => {
  const ctx = await setupTest((url) =>
    buildMockPageReply(url, {
      contentType: 'application/json',
      text: '{"name":"reefkit"}',
      retryAfterMs: 3000,
    }),
  );

  const outcome = await ctx.runFetch('https://pypi.org/project/reefkit/');

  invariant(outcome.status === 'ok' && typeof outcome.result['page'] === 'string');

  const stored = await ctx.readStored(outcome.result['page']);

  expect(ctx.requestedURLs).toStrictEqual(['https://pypi.org/pypi/reefkit/json']);
  expect(stored).toMatchObject({ url: 'https://pypi.org/pypi/reefkit/json' });
  expect(ctx.backoff.readPause('pypi.org')).toBe(3000);
});

test('it passes a URL that does not parse to the fetch, and returns its refusal', async () => {
  const ctx = await setupTest(() => ({
    kind: 'refused',
    reason: 'the URL is not valid',
    isGated: true,
  }));

  const outcome = await ctx.runFetch('not a url');

  expect(ctx.requestedURLs).toStrictEqual(['not a url']);
  expect(outcome).toStrictEqual({ status: 'error', message: 'the URL is not valid' });
});

test('it sets no pause for a 404', async () => {
  const ctx = await setupTest((url) => buildMockPageReply(url, { status: 404, text: 'Not here' }));

  await ctx.runFetch('https://example.com/a');

  expect(ctx.backoff.readPause('example.com')).toBe(0);
});

test('it sets no pause for a wait of 0', async () => {
  const ctx = await setupTest((url) => buildMockPageReply(url, { status: 429, retryAfterMs: 0 }));

  await ctx.runFetch('https://example.com/a');

  expect(ctx.backoff.readPause('example.com')).toBe(0);
});

test('it sets both pauses and returns the named URL reply when the named URL is rate-limited too', async () => {
  const ctx = await setupTest((url) =>
    url === 'https://www.npmjs.com/package/tidepool'
      ? buildMockPageReply(url, { status: 429, retryAfterMs: 20_000, text: 'Slow down' })
      : buildMockPageReply(url, { status: 429, retryAfterMs: 10_000, text: 'Too fast' }),
  );

  const outcome = await ctx.runFetch('https://www.npmjs.com/package/tidepool');

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { url: 'https://www.npmjs.com/package/tidepool', status: 429, text: 'Slow down' },
  });

  expect(ctx.backoff.readPause('registry.npmjs.org')).toBe(10_000);
  expect(ctx.backoff.readPause('www.npmjs.com')).toBe(20_000);
});

test('it sets no pause and no fallback for a 403 bot challenge', async () => {
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

  expect(ctx.requestedURLs).toHaveLength(1);
  expect(ctx.backoff.readPause('en.wikipedia.org')).toBe(0);
});

test('it ends the second pass with the pause error when a same-host rewrite pauses its own host for long', async () => {
  const ctx = await setupTest((url) =>
    buildMockPageReply(url, { status: 429, retryAfterMs: 60_000 }),
  );

  const outcome = await ctx.runFetch('https://pypi.org/project/reefkit/');

  expect(ctx.requestedURLs).toStrictEqual(['https://pypi.org/pypi/reefkit/json']);

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'pypi.org asked for a pause, so fetch it again in 60 seconds',
  });
});

test('it waits out a short pause of a same-host rewrite before the second pass', async () => {
  const ctx = await setupTest((url) =>
    url === 'https://pypi.org/project/reefkit/'
      ? buildMockPageReply(url, { contentType: 'text/html', text: 'Reefkit home' })
      : buildMockPageReply(url, { status: 429, retryAfterMs: 3000 }),
  );

  const running = ctx.runFetch('https://pypi.org/project/reefkit/');

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(3000);

  const outcome = await running;

  expect(outcome).toMatchObject({ status: 'ok', result: { text: 'Reefkit home' } });
});

test('it reads the owner messages once across both passes of a call, after the first match', async () => {
  const typedChecks: string[] = [];

  const ctx = await setupTest(
    (url) =>
      url === 'https://www.npmjs.com/package/tidepool-marked'
        ? buildMockPageReply(url, { text: 'The package page' })
        : buildMockPageReply(url, { status: 404, text: 'Not found' }),
    {
      secretScan: {
        findSecret: (url) => (url.includes('marked') ? { rule: 'test-rule' } : null),
        isOwnerTyped: (_run, url) => {
          typedChecks.push(url);

          return Promise.resolve(true);
        },
      },
    },
  );

  const outcome = await ctx.runFetch('https://www.npmjs.com/package/tidepool-marked');

  expect(ctx.requestedURLs).toStrictEqual([
    'https://registry.npmjs.org/tidepool-marked/latest',
    'https://www.npmjs.com/package/tidepool-marked',
  ]);

  expect(typedChecks).toStrictEqual(['https://www.npmjs.com/package/tidepool-marked']);
  expect(outcome).toMatchObject({ status: 'ok', result: { status: 200 } });
});

test('it reads no owner message for a fetch that matches no rule', async () => {
  const typedChecks: string[] = [];

  const ctx = await setupTest((url) => buildMockPageReply(url), {
    secretScan: {
      isOwnerTyped: (_run, url) => {
        typedChecks.push(url);

        return Promise.resolve(true);
      },
    },
  });

  await ctx.runFetch('https://example.com/docs');

  expect(typedChecks).toStrictEqual([]);
});

test('it ends the call at the URL scan when the sent URL holds a secret, with no sandbox started', async () => {
  const ctx = await setupTest((url) => buildMockPageReply(url), {
    secretScan: { findSecret: () => ({ rule: 'test-rule' }) },
  });

  const outcome = await ctx.runFetch('https://example.com/docs');

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'the URL holds a secret (rule test-rule), so it was not fetched',
  });

  expect(ctx.adapter.created).toHaveLength(0);
});

test('it returns the stored page of a URL fetched inside the cache time, with no sandbox started', async () => {
  const ctx = await setupTest((url) => buildMockPageReply(url, { text: 'Open page' }), {
    cacheMs: 300_000,
  });

  const first = await ctx.runFetch('https://example.com/docs');

  ctx.clock.advance(299_000);

  const second = await ctx.runFetch('https://example.com/docs');

  invariant(first.status === 'ok');

  expect(second).toStrictEqual({ status: 'ok', result: { ...first.result, isCached: true } });
  expect(ctx.requestedURLs).toStrictEqual(['https://example.com/docs']);
});

test('it fetches a URL again once the cache time has passed', async () => {
  const ctx = await setupTest((url) => buildMockPageReply(url), { cacheMs: 300_000 });

  await ctx.runFetch('https://example.com/docs');

  ctx.clock.advance(300_000);

  const outcome = await ctx.runFetch('https://example.com/docs');

  expect(outcome).toMatchObject({ status: 'ok', result: { isCached: false } });
  expect(ctx.requestedURLs).toStrictEqual(['https://example.com/docs', 'https://example.com/docs']);
});

test('it fetches again with fresh true, inside the cache time', async () => {
  const ctx = await setupTest((url) => buildMockPageReply(url), { cacheMs: 300_000 });

  await ctx.runFetch('https://example.com/docs');

  const outcome = await ctx.runFetch('https://example.com/docs', { fresh: true });

  expect(outcome).toMatchObject({ status: 'ok', result: { isCached: false } });
  expect(ctx.requestedURLs).toStrictEqual(['https://example.com/docs', 'https://example.com/docs']);
});

test('it returns the stored page of a host that is paused', async () => {
  const ctx = await setupTest(
    (url) => buildMockPageReply(url, { text: 'Open page', retryAfterMs: 60_000 }),
    { cacheMs: 300_000 },
  );

  await ctx.runFetch('https://example.com/docs');

  const outcome = await ctx.runFetch('https://example.com/docs');

  expect(outcome).toMatchObject({ status: 'ok', result: { text: 'Open page', isCached: true } });
  expect(ctx.requestedURLs).toStrictEqual(['https://example.com/docs']);
});

test('it ignores a fragment when it finds the stored page', async () => {
  const ctx = await setupTest((url) => buildMockPageReply(url), { cacheMs: 300_000 });

  await ctx.runFetch('https://example.com/docs');

  const outcome = await ctx.runFetch('https://example.com/docs#install');

  expect(outcome).toMatchObject({ status: 'ok', result: { isCached: true } });
  expect(ctx.requestedURLs).toStrictEqual(['https://example.com/docs']);
});

test('it finds the page of a rewritten URL by the URL that was sent', async () => {
  const ctx = await setupTest(
    (url) =>
      buildMockPageReply(url, { contentType: 'application/json', text: '{"name":"reefkit"}' }),
    { cacheMs: 300_000 },
  );

  await ctx.runFetch('https://pypi.org/project/reefkit/');

  const outcome = await ctx.runFetch('https://pypi.org/project/reefkit/');

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { url: 'https://pypi.org/pypi/reefkit/json', isCached: true },
  });

  expect(ctx.requestedURLs).toStrictEqual(['https://pypi.org/pypi/reefkit/json']);
});

test('it finds the page of an http URL whose fetch ended at https by the URL that was sent', async () => {
  const ctx = await setupTest(
    () => buildMockPageReply('https://example.com/docs', { text: 'Secure page' }),
    { cacheMs: 300_000 },
  );

  await ctx.runFetch('http://example.com/docs');

  const outcome = await ctx.runFetch('http://example.com/docs');

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { url: 'https://example.com/docs', text: 'Secure page', isCached: true },
  });

  expect(ctx.requestedURLs).toStrictEqual(['http://example.com/docs']);
});

test.each([
  ['a 404 page', { status: 404 }],
  ['a page with a blocked reason', { blocked: 'bot challenge' }],
])('it fetches again after %s', async (_name, overrides) => {
  const ctx = await setupTest((url) => buildMockPageReply(url, overrides), { cacheMs: 300_000 });

  await ctx.runFetch('https://example.com/docs');
  await ctx.runFetch('https://example.com/docs');

  expect(ctx.requestedURLs).toStrictEqual(['https://example.com/docs', 'https://example.com/docs']);
});

test('it fetches again with cache_ms 0', async () => {
  const ctx = await setupTest((url) => buildMockPageReply(url), { cacheMs: 0 });

  await ctx.runFetch('https://example.com/docs');
  await ctx.runFetch('https://example.com/docs');

  expect(ctx.requestedURLs).toStrictEqual(['https://example.com/docs', 'https://example.com/docs']);
});

test('it fetches a URL that another session stored', async () => {
  const ctx = await setupTest((url) => buildMockPageReply(url), { cacheMs: 300_000 });

  await ctx.runFetch('https://example.com/docs');

  const outcome = await ctx.runFetch('https://example.com/docs', { sessionKey: 'session-b' });

  expect(outcome).toMatchObject({ status: 'ok', result: { isCached: false } });
  expect(ctx.requestedURLs).toStrictEqual(['https://example.com/docs', 'https://example.com/docs']);
});

test('it fetches a cached URL again after a forget of its thread', async () => {
  const ctx = await setupTest((url) => buildMockPageReply(url), { cacheMs: 300_000 });

  await ctx.runFetch('https://example.com/docs');

  await removeWebFetchThread(ctx.log, 'conversation');

  const outcome = await ctx.runFetch('https://example.com/docs');

  expect(outcome).toMatchObject({ status: 'ok', result: { isCached: false } });
  expect(ctx.requestedURLs).toStrictEqual(['https://example.com/docs', 'https://example.com/docs']);
});

test('it refuses a URL that holds a secret even when a page for it is stored', async () => {
  const ctx = await setupTest((url) => buildMockPageReply(url), { cacheMs: 300_000 });

  await ctx.runFetch('https://example.com/docs');

  const refusing = await ctx.runFetch('https://example.com/docs', {
    findSecret: () => ({ rule: 'test-rule' }),
  });

  expect(refusing).toStrictEqual({
    status: 'error',
    message: 'the URL holds a secret (rule test-rule), so it was not fetched',
  });
});
