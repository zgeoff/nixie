import { expect, mock, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { waitForCondition } from '@heynixie/testing';
import type { FetchReply } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import type { PageView } from './parse-web-fetch-request';
import { readWebFetchPage } from './read-web-fetch-page';
import { removeWebFetchThread } from './remove-web-fetch-thread';
import { runPageFetch } from './run-page-fetch';
import { startTestLog } from './test-utils/start-test-log';

async function setupTest() {
  const log = await startTestLog();

  const session = { sessionKey: 'session-a', thread: 'conversation', invalidatedThrough: 0 };
  const view: PageView = { kind: 'part', part: 1 };

  return {
    log,
    runFetch: (readPage: (url: string) => Promise<FetchReply>, url: string) =>
      runPageFetch(
        {
          log,
          readPage,
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
  const ctx = await setupTest();

  const readPage = mock((url: string) =>
    Promise.resolve<FetchReply>({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url,
      status: 200,
      contentType: 'application/json',
      text: '{"name":"reefkit"}',
      links: [],
      isTruncated: false,
      blocked: null,
    }),
  );

  const outcome = await ctx.runFetch(readPage, 'https://pypi.org/project/reefkit/');

  expect(readPage.mock.calls).toStrictEqual([['https://pypi.org/pypi/reefkit/json']]);

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
    const ctx = await setupTest();

    const readPage = mock((url: string) => {
      if (url === 'https://www.npmjs.com/package/tidepool') {
        return Promise.resolve<FetchReply>({
          kind: 'page',
          retryAfterMs: null,
          isGated: false,
          url,
          status: 200,
          contentType: 'text/html',
          text: 'The tidepool package page',
          links: [],
          isTruncated: false,
          blocked: null,
        });
      }

      return Promise.resolve<FetchReply>({
        kind: 'page',
        retryAfterMs,
        isGated: false,
        url,
        status,
        contentType: 'application/json',
        text: 'the failure body',
        links: [],
        isTruncated: false,
        blocked: null,
      });
    });

    const outcome = await ctx.runFetch(readPage, 'https://www.npmjs.com/package/tidepool');

    expect(readPage.mock.calls).toStrictEqual([
      ['https://registry.npmjs.org/tidepool/latest'],
      ['https://www.npmjs.com/package/tidepool'],
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
  const ctx = await setupTest();

  const readPage = mock((url: string) =>
    Promise.resolve<FetchReply>({
      kind: 'page',
      retryAfterMs: 3000,
      isGated: false,
      url,
      status: 200,
      contentType: 'text/plain',
      text: 'Raw notes',
      links: [],
      isTruncated: false,
      blocked: null,
    }),
  );

  await ctx.runFetch(readPage, 'https://github.com/acme-labs/tidal-notes/blob/main/notes.txt');

  expect(readPage.mock.calls).toStrictEqual([
    ['https://raw.githubusercontent.com/acme-labs/tidal-notes/main/notes.txt'],
  ]);
});

test('it fetches the named URL once when a rule rewrites nothing', async () => {
  const ctx = await setupTest();

  const readPage = mock((url: string) =>
    Promise.resolve<FetchReply>({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url,
      status: 404,
      contentType: 'text/plain',
      text: 'Not here',
      links: [],
      isTruncated: false,
      blocked: null,
    }),
  );

  await ctx.runFetch(readPage, 'https://example.com/docs?page=2');

  expect(readPage.mock.calls).toStrictEqual([['https://example.com/docs?page=2']]);
});

test('it returns the rate-limit reply of the named URL, with no third fetch', async () => {
  const ctx = await setupTest();

  const readPage = mock((url: string) =>
    Promise.resolve<FetchReply>({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url,
      status: url === 'https://pypi.org/project/reefkit/' ? 429 : 404,
      contentType: 'text/plain',
      text: url === 'https://pypi.org/project/reefkit/' ? 'Slow down' : 'Not found',
      links: [],
      isTruncated: false,
      blocked: null,
    }),
  );

  const outcome = await ctx.runFetch(readPage, 'https://pypi.org/project/reefkit/');

  expect(readPage.mock.calls).toStrictEqual([
    ['https://pypi.org/pypi/reefkit/json'],
    ['https://pypi.org/project/reefkit/'],
  ]);

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { url: 'https://pypi.org/project/reefkit/', status: 429, text: 'Slow down' },
  });
});

test('it sets off no fallback for a 403 with a blocked reason on the rewritten URL', async () => {
  const ctx = await setupTest();

  const readPage = mock((url: string) =>
    Promise.resolve<FetchReply>({
      kind: 'page',
      retryAfterMs: 3000,
      isGated: false,
      url,
      status: 403,
      contentType: 'text/html',
      text: 'Just a moment',
      links: [],
      isTruncated: false,
      blocked: 'cloudflare challenge',
    }),
  );

  await ctx.runFetch(readPage, 'https://en.wikipedia.org/wiki/Lighthouse');

  expect(readPage.mock.calls).toStrictEqual([
    ['https://en.wikipedia.org/w/rest.php/v1/page/Lighthouse/html'],
  ]);
});

test('it sets off no fallback for a failed reply on the rewritten URL, and returns its reason', async () => {
  const ctx = await setupTest();

  const readPage = mock(() =>
    Promise.resolve<FetchReply>({ kind: 'failed', reason: 'the page timed out', isGated: false }),
  );

  const outcome = await ctx.runFetch(readPage, 'https://pypi.org/project/reefkit/');

  expect(readPage).toHaveBeenCalledTimes(1);
  expect(outcome).toStrictEqual({ status: 'error', message: 'the page timed out' });
});

test('it stores no row when a forget ends the session during the fetch of the named URL', async () => {
  const ctx = await setupTest();

  const secondFetch = Promise.withResolvers<FetchReply>();

  const readPage = mock((url: string) =>
    url === 'https://pypi.org/pypi/reefkit/json'
      ? Promise.resolve<FetchReply>({
          kind: 'page',
          retryAfterMs: null,
          isGated: false,
          url,
          status: 404,
          contentType: 'text/plain',
          text: 'Not found',
          links: [],
          isTruncated: false,
          blocked: null,
        })
      : secondFetch.promise,
  );

  const running = ctx.runFetch(readPage, 'https://pypi.org/project/reefkit/');

  await waitForCondition(() => readPage.mock.calls.length === 2);

  await writeRecords(ctx.log, [
    {
      kind: 'model.session_invalidated',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { itemID: '00000000-0000-4000-8000-000000000001' },
    },
  ]);

  await removeWebFetchThread(ctx.log, 'conversation');

  secondFetch.resolve({
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url: 'https://pypi.org/project/reefkit/',
    status: 200,
    contentType: 'text/html',
    text: 'Reefkit home',
    links: [],
    isTruncated: false,
    blocked: null,
  });

  const outcome = await running;

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'the session ended while the page was fetched, so fetch it again by its url',
  });
});
