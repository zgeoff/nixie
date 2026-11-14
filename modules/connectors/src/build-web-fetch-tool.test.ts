import { expect, mock, onTestFinished, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import type { ToolImage } from '@heynixie/tools';
import { buildToolRegistry } from '@heynixie/tools';
import type { FetchReply } from '@heynixie/wire';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { buildSearchTool } from './build-search-tool';
import { buildWebFetchTool } from './build-web-fetch-tool';
import { removeWebFetchThread } from './remove-web-fetch-thread';
import { startFetchSandbox } from './start-fetch-sandbox';
import { buildStubSandboxAdapter } from './test-utils/build-stub-sandbox-adapter';
import { encodeTestImage } from './test-utils/encode-test-image';
import { makeStubFetcher } from './test-utils/make-stub-fetcher';
import { startTestLog } from './test-utils/start-test-log';
import type { SearchReply } from './types';

async function setupTest() {
  return { log: await startTestLog() };
}

test('it returns the page the fetch sandbox reads at the URL as the typed result', async () => {
  const ctx = await setupTest();

  const fetchSandbox = startFetchSandbox({
    adapter: buildStubSandboxAdapter(
      makeStubFetcher((request) => ({
        kind: 'page',
        retryAfterMs: null,
        isGated: false,
        url: request.url,
        status: 200,
        contentType: 'text/html',
        text: 'Example Domain',
        links: [],
        isTruncated: false,
        blocked: null,
      })),
    ),
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const tool = buildWebFetchTool(fetchSandbox.readPage, {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const outcome = await tool.run(
    { callID: 'call-1', tool: 'web_fetch', input: { url: 'https://site.test/' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0 },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      url: 'https://site.test/',
      status: 200,
      contentType: 'text/html',
      page: expect.stringMatching(/^[a-z][\da-z]{9}$/u),
      part: 1,
      parts: 1,
      text: 'Example Domain',
      isTruncated: false,
      blocked: null,
    },
  });
});

test("it writes each link in the page's text as an ID the session numbers from 1", async () => {
  const ctx = await setupTest();

  const reply: FetchReply = {
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url: 'https://bakery.test/news',
    status: 200,
    contentType: 'text/html',
    text: 'The new loaf \u{E000}0\u{E001} is out.\n\nOther links on this page:\n- Menu \u{E000}1\u{E001}',
    links: ['https://bakery.test/bread', 'https://bakery.test/menu'],
    isTruncated: false,
    blocked: null,
  };

  const tool = buildWebFetchTool(() => Promise.resolve(reply), {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://bakery.test/news' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0 },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      url: 'https://bakery.test/news',
      status: 200,
      contentType: 'text/html',
      page: expect.stringMatching(/^[a-z][\da-z]{9}$/u),
      part: 1,
      parts: 1,
      text: 'The new loaf [L1] is out.\n\nOther links on this page:\n- Menu [L2]',
      isTruncated: false,
      blocked: null,
    },
  });
});

test('it gives a URL one ID across the pages of one session', async () => {
  const ctx = await setupTest();

  const pages: Readonly<Record<string, FetchReply>> = {
    'https://bakery.test/news': {
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: 'https://bakery.test/news',
      status: 200,
      contentType: 'text/html',
      text: 'The new loaf \u{E000}0\u{E001} and the menu \u{E000}1\u{E001}.',
      links: ['https://bakery.test/bread', 'https://bakery.test/menu'],
      isTruncated: false,
      blocked: null,
    },
    'https://bakery.test/about': {
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: 'https://bakery.test/about',
      status: 200,
      contentType: 'text/html',
      text: 'Our hours \u{E000}0\u{E001}, our menu \u{E000}1\u{E001}, the menu again \u{E000}1\u{E001}.',
      links: ['https://bakery.test/hours', 'https://bakery.test/menu'],
      isTruncated: false,
      blocked: null,
    },
  };

  const tool = buildWebFetchTool(
    (url) =>
      Promise.resolve(pages[url] ?? { kind: 'failed', reason: 'no such page', isGated: false }),
    {
      log: ctx.log,
      textBytes: 20_000,
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
    },
  );

  const run = {
    runID: 'conversation',
    thread: 'conversation',
    tools: ['web_fetch'],
    model: { model: 'model-a', profile: 'chat-direct' },
    session: { key: 'session-a', invalidatedThrough: 0 },
  };

  await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://bakery.test/news' },
      toolUseID: null,
    },
    { run },
  );

  const outcome = await tool.run(
    {
      callID: 'call-2',
      tool: 'web_fetch',
      input: { url: 'https://bakery.test/about' },
      toolUseID: null,
    },
    { run },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      url: 'https://bakery.test/about',
      status: 200,
      contentType: 'text/html',
      page: expect.stringMatching(/^[a-z][\da-z]{9}$/u),
      part: 1,
      parts: 1,
      text: 'Our hours [L3], our menu [L2], the menu again [L2].',
      isTruncated: false,
      blocked: null,
    },
  });
});

test('it shows the host and path, with no query string, only for a link that leaves the page site', async () => {
  const ctx = await setupTest();

  const reply: FetchReply = {
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url: 'https://www.ferries.test/timetable',
    status: 200,
    contentType: 'text/html',
    text: 'Fares \u{E000}0\u{E001}, the weather \u{E000}1\u{E001} and the old site \u{E000}2\u{E001}.',
    links: [
      'https://www.ferries.test/fares',
      'https://weather.test/coast?area=north',
      'http://www.ferries.test:8080/archive',
    ],
    isTruncated: false,
    blocked: null,
  };

  const tool = buildWebFetchTool(() => Promise.resolve(reply), {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://www.ferries.test/timetable' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0 },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      url: 'https://www.ferries.test/timetable',
      status: 200,
      contentType: 'text/html',
      page: expect.stringMatching(/^[a-z][\da-z]{9}$/u),
      part: 1,
      parts: 1,
      text: 'Fares [L1], the weather [L2 · weather.test/coast] and the old site [L3].',
      isTruncated: false,
      blocked: null,
    },
  });
});

test('it fetches the page a link ID names, and returns the URL the fetch ended at', async () => {
  const ctx = await setupTest();

  const pages: Readonly<Record<string, FetchReply>> = {
    'https://bakery.test/news': {
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: 'https://bakery.test/news',
      status: 200,
      contentType: 'text/html',
      text: 'The new loaf \u{E000}0\u{E001} is out.',
      links: ['https://bakery.test/bread'],
      isTruncated: false,
      blocked: null,
    },
    'https://bakery.test/bread': {
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: 'https://bakery.test/breads/sourdough',
      status: 200,
      contentType: 'text/html',
      text: 'Sourdough, baked daily.',
      links: [],
      isTruncated: false,
      blocked: null,
    },
  };

  const readPage = mock((url: string) =>
    Promise.resolve(
      pages[url] ?? { kind: 'failed' as const, reason: 'no such page', isGated: false },
    ),
  );

  const tool = buildWebFetchTool(readPage, {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const run = {
    runID: 'conversation',
    thread: 'conversation',
    tools: ['web_fetch'],
    model: { model: 'model-a', profile: 'chat-direct' },
    session: { key: 'session-a', invalidatedThrough: 0 },
  };

  await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://bakery.test/news' },
      toolUseID: null,
    },
    { run },
  );

  const outcome = await tool.run(
    { callID: 'call-2', tool: 'web_fetch', input: { link: 'L1' }, toolUseID: null },
    { run },
  );

  expect(readPage).toHaveBeenLastCalledWith('https://bakery.test/bread');

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      url: 'https://bakery.test/breads/sourdough',
      status: 200,
      contentType: 'text/html',
      page: expect.stringMatching(/^[a-z][\da-z]{9}$/u),
      part: 1,
      parts: 1,
      text: 'Sourdough, baked daily.',
      isTruncated: false,
      blocked: null,
    },
  });
});

test("it fetches the URL of a search hit by the hit's link ID", async () => {
  const ctx = await setupTest();

  const search = buildSearchTool(
    {
      readHits: () =>
        Promise.resolve<SearchReply>({
          kind: 'hits',
          hits: [
            {
              title: 'Sourdough at the corner bakery',
              url: 'https://bakery.test/breads/sourdough',
              snippet: 'Baked daily.',
              date: null,
            },
          ],
          costUSD: 0.012,
        }),
    },
    {
      log: ctx.log,
      clock: buildTestClock(Date.parse('2026-11-07T01:00:00.000Z')),
      dailyCallCap: 200,
      timeZone: 'UTC',
    },
  );

  const readPage = mock<(url: string) => Promise<FetchReply>>((url) =>
    Promise.resolve({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url,
      status: 200,
      contentType: 'text/html',
      text: 'Sourdough, baked daily.',
      links: [],
      isTruncated: false,
      blocked: null,
    }),
  );

  const tool = buildWebFetchTool(readPage, {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const run = {
    runID: 'conversation',
    thread: 'conversation',
    tools: ['search', 'web_fetch'],
    model: { model: 'model-a', profile: 'chat-direct' },
    session: { key: 'session-a', invalidatedThrough: 0 },
  };

  await search.run(
    { callID: 'call-1', tool: 'search', input: { query: 'sourdough' }, toolUseID: null },
    { run },
  );

  await tool.run(
    { callID: 'call-2', tool: 'web_fetch', input: { link: 'L1' }, toolUseID: null },
    { run },
  );

  expect(readPage).toHaveBeenCalledExactlyOnceWith('https://bakery.test/breads/sourdough');
});

test.each([
  ['L1'],
  ['l1'],
  ['[L1]'],
  [' L1 '],
  ['[L1 · bakery.test]'],
  ['[L1 · bakery.test/breads/…]'],
])('it reads %p as the ID of link 1', async (link) => {
  const ctx = await setupTest();

  const readPage = mock<(url: string) => Promise<FetchReply>>(() =>
    Promise.resolve({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: 'https://bakery.test/news',
      status: 200,
      contentType: 'text/html',
      text: 'The new loaf \u{E000}0\u{E001} is out.',
      links: ['https://bakery.test/bread'],
      isTruncated: false,
      blocked: null,
    }),
  );

  const tool = buildWebFetchTool(readPage, {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const run = {
    runID: 'conversation',
    thread: 'conversation',
    tools: ['web_fetch'],
    model: { model: 'model-a', profile: 'chat-direct' },
    session: { key: 'session-a', invalidatedThrough: 0 },
  };

  await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://bakery.test/news' },
      toolUseID: null,
    },
    { run },
  );

  await tool.run(
    { callID: 'call-2', tool: 'web_fetch', input: { link }, toolUseID: null },
    { run },
  );

  expect(readPage).toHaveBeenLastCalledWith('https://bakery.test/bread');
});

test('it reads the whole tag of a link to an IPv6 host, as a page showed it, as that link', async () => {
  const ctx = await setupTest();

  const readPage = mock<(url: string) => Promise<FetchReply>>(() =>
    Promise.resolve({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: 'https://bakery.test/news',
      status: 200,
      contentType: 'text/html',
      text: 'Bread\u{E000}0\u{E001}',
      links: ['https://[2001:db8::1]/breads'],
      isTruncated: false,
      blocked: null,
    }),
  );

  const tool = buildWebFetchTool(readPage, {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const run = {
    runID: 'conversation',
    thread: 'conversation',
    tools: ['web_fetch'],
    model: { model: 'model-a', profile: 'chat-direct' },
    session: { key: 'session-a', invalidatedThrough: 0 },
  };

  const page = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://bakery.test/news' },
      toolUseID: null,
    },
    { run },
  );

  invariant(page.status === 'ok' && typeof page.result['text'] === 'string');

  await tool.run(
    {
      callID: 'call-2',
      tool: 'web_fetch',
      input: { link: page.result['text'].slice('Bread'.length) },
      toolUseID: null,
    },
    { run },
  );

  expect(readPage).toHaveBeenLastCalledWith('https://[2001:db8::1]/breads');
});

test('it refuses the ID of a link an earlier session numbered, and fetches nothing', async () => {
  const ctx = await setupTest();

  const readPage = mock<(url: string) => Promise<FetchReply>>(() =>
    Promise.resolve({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: 'https://bakery.test/news',
      status: 200,
      contentType: 'text/html',
      text: 'The new loaf \u{E000}0\u{E001} is out.',
      links: ['https://bakery.test/bread'],
      isTruncated: false,
      blocked: null,
    }),
  );

  const tool = buildWebFetchTool(readPage, {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://bakery.test/news' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0 },
      },
    },
  );

  const outcome = await tool.run(
    { callID: 'call-2', tool: 'web_fetch', input: { link: 'L1' }, toolUseID: null },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-b', invalidatedThrough: 0 },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'L1 is not a link from this session. An ID works only in the session whose page or ' +
      'search showed it, so fetch that page again by its url.',
  });

  expect(readPage).toHaveBeenCalledOnce();
});

test('it refuses a page whose session a forget ended while it was fetched, and stores no link or page', async () => {
  const ctx = await setupTest();

  const reply: FetchReply = {
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url: 'https://bakery.test/news',
    status: 200,
    contentType: 'text/html',
    text: 'The menu \u{E000}0\u{E001}.',
    links: ['https://bakery.test/menu'],
    isTruncated: false,
    blocked: null,
  };

  const fetched = Promise.withResolvers<FetchReply>();
  const readPage = mock(() => fetched.promise);

  const tool = buildWebFetchTool(readPage, {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const running = tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://bakery.test/news' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0 },
      },
    },
  );

  await waitForCondition(() => readPage.mock.calls.length === 1);

  await writeRecords(ctx.log, [
    {
      kind: 'model.session_invalidated',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { itemID: '00000000-0000-4000-8000-000000000001' },
    },
  ]);

  await removeWebFetchThread(ctx.log, 'conversation');

  fetched.resolve(reply);

  const outcome = await running;
  const links = await sql`select url from web_fetch_links`.execute(ctx.log.writer.db);
  const pages = await sql`select url from web_fetch_pages`.execute(ctx.log.writer.db);

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'the session ended while the page was fetched, so fetch it again by its url',
  });

  expect(links.rows).toStrictEqual([]);
  expect(pages.rows).toStrictEqual([]);
});

test("it numbers a new session's links from 1 again", async () => {
  const ctx = await setupTest();

  const reply: FetchReply = {
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url: 'https://bakery.test/news',
    status: 200,
    contentType: 'text/html',
    text: 'The menu \u{E000}0\u{E001}.',
    links: ['https://bakery.test/menu'],
    isTruncated: false,
    blocked: null,
  };

  const tool = buildWebFetchTool(() => Promise.resolve(reply), {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const otherReply: FetchReply = {
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url: 'https://bakery.test/about',
    status: 200,
    contentType: 'text/html',
    text: 'Our hours \u{E000}0\u{E001}.',
    links: ['https://bakery.test/hours'],
    isTruncated: false,
    blocked: null,
  };

  await buildWebFetchTool(() => Promise.resolve(otherReply), {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  }).run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://bakery.test/about' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0 },
      },
    },
  );

  const outcome = await tool.run(
    {
      callID: 'call-2',
      tool: 'web_fetch',
      input: { url: 'https://bakery.test/news' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-b', invalidatedThrough: 0 },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      url: 'https://bakery.test/news',
      status: 200,
      contentType: 'text/html',
      page: expect.stringMatching(/^[a-z][\da-z]{9}$/u),
      part: 1,
      parts: 1,
      text: 'The menu [L1].',
      isTruncated: false,
      blocked: null,
    },
  });
});

test('it keys the links of a call under the run token by the run', async () => {
  const ctx = await setupTest();

  const readPage = mock<(url: string) => Promise<FetchReply>>(() =>
    Promise.resolve({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: 'https://bakery.test/news',
      status: 200,
      contentType: 'text/html',
      text: 'The new loaf \u{E000}0\u{E001} is out.',
      links: ['https://bakery.test/bread'],
      isTruncated: false,
      blocked: null,
    }),
  );

  const tool = buildWebFetchTool(readPage, {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const run = {
    runID: 'conversation',
    thread: 'conversation',
    tools: ['web_fetch'],
    model: { model: 'model-a', profile: 'chat-direct' },
  };

  await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://bakery.test/news' },
      toolUseID: null,
    },
    { run },
  );

  await tool.run(
    { callID: 'call-2', tool: 'web_fetch', input: { link: 'L1' }, toolUseID: null },
    { run },
  );

  expect(readPage).toHaveBeenLastCalledWith('https://bakery.test/bread');
});

test.each([
  ['both a url and a link', { url: 'https://bakery.test/', link: 'L1' }],
  ['neither a url nor a link', {}],
  ['a page and a url', { page: 'qx7f2m9kpa', url: 'https://bakery.test/', part: 2 }],
  ['a page with neither a part nor a find', { page: 'qx7f2m9kpa' }],
])('it refuses a call that gives %s', async (_, input) => {
  const ctx = await setupTest();

  const readPage = mock();

  const tool = buildWebFetchTool(readPage, {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const outcome = await tool.run(
    { callID: 'call-1', tool: 'web_fetch', input, toolUseID: null },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0 },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'give the url of a page or the ID of a link, with an optional part or find; or give the ' +
      'ID of a page this session fetched, with a part or a find',
  });

  expect(readPage).not.toHaveBeenCalled();
});

test('it refuses a link that does not read as a link ID', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(mock(), {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { link: 'https://bakery.test/' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0 },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'https://bakery.test/ is not a link ID; an ID reads like L12',
  });
});

test('it cuts the link text of a long page full of links from about 42,000 characters to under 10,000', async () => {
  const ctx = await setupTest();

  // an invented almanac page of 420 stations, each with a long link, every tenth to a weather site
  const targets = Array.from({ length: 420 }, (_, index) =>
    index % 10 === 9
      ? `https://coastal-weather.test/forecasts/station-${index}/marine?days=7&units=metric&lang=en`
      : `https://almanac.test/harbours/station-${index}/tide-tables/2026/spring-and-neap-observations?view=full`,
  );

  const text = targets
    .map((_, index) => `Station ${index} readings \u{E000}${index}\u{E001}`)
    .join('\n');

  const reply: FetchReply = {
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url: 'https://almanac.test/harbours',
    status: 200,
    contentType: 'text/html',
    text,
    links: targets,
    isTruncated: false,
    blocked: null,
  };

  const tool = buildWebFetchTool(() => Promise.resolve(reply), {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://almanac.test/harbours' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0 },
      },
    },
  );

  invariant(outcome.status === 'ok' && typeof outcome.result['text'] === 'string');

  // the link text the full targets cost, as " [→ <target>]" after each link
  const fullTargetText = targets.reduce((sum, target) => sum + ` [→ ${target}]`.length, 0);

  const idText = [...outcome.result['text'].matchAll(/ \[L\d+(?: · [^\]]+)?\]/gu)].reduce(
    (sum, match) => sum + match[0].length,
    0,
  );

  expect(fullTargetText).toBeWithin(40_000, 44_000);
  expect(idText).toBeLessThan(10_000);

  expect(outcome.result['text']).toInclude(
    'Station 9 readings [L10 · coastal-weather.test/forecasts/station-9/mar…]',
  );
});

test('it returns the reason the bot protection blocked a page in a result the schema accepts', async () => {
  const ctx = await setupTest();

  const fetchSandbox = startFetchSandbox({
    adapter: buildStubSandboxAdapter(
      makeStubFetcher((request) => ({
        kind: 'page',
        retryAfterMs: null,
        isGated: false,
        url: request.url,
        status: 403,
        contentType: 'text/html',
        text: 'Just a moment...',
        links: [],
        isTruncated: false,
        blocked: "blocked by the site's bot protection (Cloudflare challenge)",
      })),
    ),
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const registered = buildToolRegistry([
    buildWebFetchTool(fetchSandbox.readPage, {
      log: ctx.log,
      textBytes: 20_000,
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
    }),
  ]).findTool('web_fetch');

  invariant(registered);

  const outcome = await registered.definition.run(
    { callID: 'call-1', tool: 'web_fetch', input: { url: 'https://site.test/' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
    },
  );

  invariant(outcome.status === 'ok');

  expect(outcome.result).toStrictEqual({
    url: 'https://site.test/',
    status: 403,
    contentType: 'text/html',
    page: expect.stringMatching(/^[a-z][\da-z]{9}$/u),
    part: 1,
    parts: 1,
    text: 'Just a moment...',
    isTruncated: false,
    blocked: "blocked by the site's bot protection (Cloudflare challenge)",
  });

  expect(registered.parseOutput(outcome.result)).toStrictEqual({ isValid: true });
});

test('it returns a page result that the registry checks against the output schema', async () => {
  const ctx = await setupTest();

  const reply: FetchReply = {
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url: 'https://site.test/',
    status: 200,
    contentType: 'text/html',
    text: 'Example Domain \u{E000}0\u{E001}',
    links: ['https://other.test/'],
    isTruncated: false,
    blocked: null,
  };

  const registered = buildToolRegistry([
    buildWebFetchTool(() => Promise.resolve(reply), {
      log: ctx.log,
      textBytes: 20_000,
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
    }),
  ]).findTool('web_fetch');

  invariant(registered);

  const outcome = await registered.definition.run(
    { callID: 'call-1', tool: 'web_fetch', input: { url: 'https://site.test/' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
    },
  );

  invariant(outcome.status === 'ok');

  expect(registered.parseOutput(outcome.result)).toStrictEqual({ isValid: true });
});

test.each([
  ['a url', { url: 'https://site.test/' }, true],
  ['a link', { link: 'L4' }, true],
  ['a page with a part', { page: 'qx7f2m9kpa', part: 2 }, true],
  ['a page with a find', { page: 'qx7f2m9kpa', find: 'ferries' }, true],
  ['a part of 0', { page: 'qx7f2m9kpa', part: 0 }, false],
  ['an empty find', { page: 'qx7f2m9kpa', find: '' }, false],
  ['a key the schema lacks', { host: 'site.test' }, false],
])('it checks an input that names %s against the input schema', async (_, input, isValid) => {
  const ctx = await setupTest();

  const registered = buildToolRegistry([
    buildWebFetchTool(mock(), {
      log: ctx.log,
      textBytes: 20_000,
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
    }),
  ]).findTool('web_fetch');

  invariant(registered);

  expect(registered.parseInput(input).isValid).toBe(isValid);
});

test('it returns a binary page with no text', async () => {
  const ctx = await setupTest();

  const reply: FetchReply = {
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url: 'https://example.com/a.png',
    status: 200,
    contentType: 'image/png',
    text: null,
    links: [],
    isTruncated: false,
    blocked: null,
  };

  const tool = buildWebFetchTool(() => Promise.resolve(reply), {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://example.com/a.png' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      url: 'https://example.com/a.png',
      status: 200,
      contentType: 'image/png',
      page: null,
      part: null,
      parts: 0,
      text: null,
      isTruncated: false,
      blocked: null,
    },
  });
});

test.each([
  ['refused', 'only http and https URLs are fetched, not ftp:'],
  ['failed', 'the fetch passed 15000 ms'],
] as const)('it returns a %s fetch as an error with its reason', async (kind, reason) => {
  const ctx = await setupTest();

  const fetchSandbox = startFetchSandbox({
    adapter: buildStubSandboxAdapter(makeStubFetcher(() => ({ kind, reason, isGated: false }))),
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const tool = buildWebFetchTool(fetchSandbox.readPage, {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const outcome = await tool.run(
    { callID: 'call-1', tool: 'web_fetch', input: { url: 'http://example.com/' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
    },
  );

  expect(outcome).toStrictEqual({ status: 'error', message: reason });
});

test('it declares only the fetch effect and no destination, so it runs direct', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(mock(), {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  expect(tool.execution).toBe('direct');

  expect(tool.declaration).toStrictEqual({
    effects: ['fetch'],
    destinations: [],
    amount: null,
    content: [],
    results: expect.any(Object),
  });
});

test('it marks every result field as outside content', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(mock(), {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  expect(tool.declaration.results).toStrictEqual({
    url: 'untrusted',
    status: 'untrusted',
    contentType: 'untrusted',
    page: 'untrusted',
    part: 'untrusted',
    parts: 'untrusted',
    text: 'untrusted',
    isTruncated: 'untrusted',
    blocked: 'untrusted',
    image: 'untrusted',
    matches: 'untrusted',
  });
});

test('it endorses only the status code, the part numbers and the truncated mark', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(mock(), {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  expect(tool.output['properties']).toStrictEqual({
    url: { type: 'string' },
    status: { type: 'integer', 'x-endorsed': true },
    contentType: { type: ['string', 'null'] },
    page: { type: ['string', 'null'] },
    part: { type: ['integer', 'null'], 'x-endorsed': true },
    parts: { type: 'integer', 'x-endorsed': true },
    text: { type: ['string', 'null'] },
    isTruncated: { type: 'boolean', 'x-endorsed': true },
    blocked: { type: ['string', 'null'] },
    image: {
      type: 'object',
      properties: {
        mediaType: { type: 'string' },
        width: { type: 'integer' },
        height: { type: 'integer' },
      },
      required: ['mediaType', 'width', 'height'],
      additionalProperties: false,
    },
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: { part: { type: 'integer' }, snippet: { type: 'string' } },
        required: ['part', 'snippet'],
        additionalProperties: false,
      },
    },
  });
});

test('it is a tool the registry accepts', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(mock(), {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  expect(() => buildToolRegistry([tool])).not.toThrow();
});

test('it reads part 2 of a page longer than one part by its page ID, with no new sandbox, and the same text each time', async () => {
  const ctx = await setupTest();

  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'Ferries leave the harbour at nine.\nThe last ferry returns at six.',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 1000, timeoutMs: 1000, redirects: 2, textBytes: 1000, imageBytes: 1000 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const tool = buildWebFetchTool(fetchSandbox.readPage, {
    log: ctx.log,
    textBytes: 40,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const run = {
    runID: 'conversation',
    thread: 'conversation',
    tools: ['web_fetch'],
    model: { model: 'model-a', profile: 'chat-direct' },
    session: { key: 'session-a', invalidatedThrough: 0 },
  };

  const first = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://harbour.test/ferries' },
      toolUseID: null,
    },
    { run },
  );

  invariant(first.status === 'ok' && typeof first.result['page'] === 'string');

  const page = first.result['page'];

  const second = await tool.run(
    { callID: 'call-2', tool: 'web_fetch', input: { page, part: 2 }, toolUseID: null },
    { run },
  );

  const third = await tool.run(
    { callID: 'call-3', tool: 'web_fetch', input: { page, part: 2 }, toolUseID: null },
    { run },
  );

  expect(second).toStrictEqual({
    status: 'ok',
    result: {
      url: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/plain',
      page,
      part: 2,
      parts: 2,
      text: 'The last ferry returns at six.',
      isTruncated: false,
      blocked: null,
    },
  });

  expect(third).toStrictEqual(second);
  expect(adapter.created).toHaveLength(1);
});

test('it fits every part, once its links read as tags, in the text limit, and never splits a tag or a character', async () => {
  const ctx = await setupTest();

  const targets = Array.from({ length: 60 }, (_, index) =>
    index % 3 === 0
      ? `https://weather.test/coast/pier-${index}`
      : `https://harbour.test/piers/pier-${index}`,
  );

  const reply: FetchReply = {
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url: 'https://harbour.test/piers',
    status: 200,
    contentType: 'text/html',
    text: targets.map((_, index) => `Pier ${index}, café 🌊 \u{E000}${index}\u{E001}`).join(' '),
    links: targets,
    isTruncated: false,
    blocked: null,
  };

  const tool = buildWebFetchTool(() => Promise.resolve(reply), {
    log: ctx.log,
    textBytes: 64,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const run = {
    runID: 'conversation',
    thread: 'conversation',
    tools: ['web_fetch'],
    model: { model: 'model-a', profile: 'chat-direct' },
    session: { key: 'session-a', invalidatedThrough: 0 },
  };

  const first = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://harbour.test/piers' },
      toolUseID: null,
    },
    { run },
  );

  invariant(
    first.status === 'ok' &&
      typeof first.result['parts'] === 'number' &&
      typeof first.result['page'] === 'string',
  );

  const page = first.result['page'];

  const outcomes = await Promise.all(
    Array.from({ length: first.result['parts'] }, (_, index) =>
      tool.run(
        {
          callID: `call-${index + 2}`,
          tool: 'web_fetch',
          input: { page, part: index + 1 },
          toolUseID: null,
        },
        { run },
      ),
    ),
  );

  const parts = outcomes.map((outcome) =>
    outcome.status === 'ok' && typeof outcome.result['text'] === 'string'
      ? outcome.result['text']
      : null,
  );

  const fullText = targets
    .map((target, index) => {
      const tag = target.startsWith('https://weather.test/')
        ? `[L${index + 1} · weather.test/coast/pier-${index}]`
        : `[L${index + 1}]`;

      return `Pier ${index}, café 🌊 ${tag}`;
    })
    .join(' ');

  expect(parts).toSatisfyAll(
    (part: unknown) =>
      typeof part === 'string' &&
      Buffer.byteLength(part) <= 64 &&
      part.isWellFormed() &&
      /^[^[\]]*(?:\[L\d+(?: · [^[\]]+)?\][^[\]]*)*$/u.test(part),
  );

  expect(parts.join('')).toBe(fullText);
});

test('it fetches the page again for a url with a part, and returns that part', async () => {
  const ctx = await setupTest();

  const readPage = mock<(url: string) => Promise<FetchReply>>(() =>
    Promise.resolve({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/plain',
      text: 'Pier 1 is open.\nPier 2 is open.\nPier 3 is shut.',
      links: [],
      isTruncated: false,
      blocked: null,
    }),
  );

  const tool = buildWebFetchTool(readPage, {
    log: ctx.log,
    textBytes: 20,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://harbour.test/ferries', part: 3 },
      toolUseID: null,
    },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0 },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      url: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/plain',
      page: expect.stringMatching(/^[a-z][\da-z]{9}$/u),
      part: 3,
      parts: 3,
      text: 'Pier 3 is shut.',
      isTruncated: false,
      blocked: null,
    },
  });

  expect(readPage).toHaveBeenCalledOnce();
});

test('it refuses a part past the end of a page, and names its count of parts', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(
    () =>
      Promise.resolve({
        kind: 'page',
        retryAfterMs: null,
        isGated: false,
        url: 'https://harbour.test/ferries',
        status: 200,
        contentType: 'text/plain',
        text: 'Pier 1 is open.\nPier 2 is open.',
        links: [],
        isTruncated: false,
        blocked: null,
      }),
    {
      log: ctx.log,
      textBytes: 20,
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
    },
  );

  const run = {
    runID: 'conversation',
    thread: 'conversation',
    tools: ['web_fetch'],
    model: { model: 'model-a', profile: 'chat-direct' },
    session: { key: 'session-a', invalidatedThrough: 0 },
  };

  const first = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://harbour.test/ferries' },
      toolUseID: null,
    },
    { run },
  );

  invariant(first.status === 'ok' && typeof first.result['page'] === 'string');

  const page = first.result['page'];

  const outcome = await tool.run(
    { callID: 'call-2', tool: 'web_fetch', input: { page, part: 3 }, toolUseID: null },
    { run },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `page ${page} has 2 parts, so it has no part 3`,
  });
});

test('it returns the part that holds the first match of find, with every match, and fetches nothing', async () => {
  const ctx = await setupTest();

  const readPage = mock<(url: string) => Promise<FetchReply>>(() =>
    Promise.resolve({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/plain',
      text: 'Pier 1 is open.\nPier 2 is open.\nThe ISLAND ferry.\nIsland tours.',
      links: [],
      isTruncated: false,
      blocked: null,
    }),
  );

  const tool = buildWebFetchTool(readPage, {
    log: ctx.log,
    textBytes: 20,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const run = {
    runID: 'conversation',
    thread: 'conversation',
    tools: ['web_fetch'],
    model: { model: 'model-a', profile: 'chat-direct' },
    session: { key: 'session-a', invalidatedThrough: 0 },
  };

  const first = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://harbour.test/ferries' },
      toolUseID: null,
    },
    { run },
  );

  invariant(first.status === 'ok' && typeof first.result['page'] === 'string');

  const page = first.result['page'];

  const outcome = await tool.run(
    { callID: 'call-2', tool: 'web_fetch', input: { page, find: 'island' }, toolUseID: null },
    { run },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      url: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/plain',
      page,
      part: 3,
      parts: 4,
      text: 'The ISLAND ferry.\n',
      isTruncated: false,
      blocked: null,
      matches: [
        { part: 3, snippet: 'Pier 1 is open.\nPier 2 is open.\nThe ISLAND ferry.\nIsland tours.' },
        { part: 4, snippet: 'Pier 1 is open.\nPier 2 is open.\nThe ISLAND ferry.\nIsland tours.' },
      ],
    },
  });

  expect(readPage).toHaveBeenCalledOnce();
});

test('it says a find with no match found none, with the count of parts', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(
    () =>
      Promise.resolve({
        kind: 'page',
        retryAfterMs: null,
        isGated: false,
        url: 'https://harbour.test/piers',
        status: 200,
        contentType: 'text/plain',
        text: Array.from({ length: 7 }, (_, index) => `Pier ${index + 1} is open.`).join('\n'),
        links: [],
        isTruncated: false,
        blocked: null,
      }),
    {
      log: ctx.log,
      textBytes: 20,
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
    },
  );

  const run = {
    runID: 'conversation',
    thread: 'conversation',
    tools: ['web_fetch'],
    model: { model: 'model-a', profile: 'chat-direct' },
    session: { key: 'session-a', invalidatedThrough: 0 },
  };

  const first = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://harbour.test/piers' },
      toolUseID: null,
    },
    { run },
  );

  invariant(first.status === 'ok' && typeof first.result['page'] === 'string');

  const page = first.result['page'];

  const outcome = await tool.run(
    { callID: 'call-2', tool: 'web_fetch', input: { page, find: 'Grok' }, toolUseID: null },
    { run },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `0 matches in 7 parts of page ${page}`,
  });
});

test('it refuses a page ID no session stored, and fetches nothing', async () => {
  const ctx = await setupTest();

  const readPage = mock();

  const tool = buildWebFetchTool(readPage, {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { page: 'qx7f2m9kpa', part: 1 },
      toolUseID: null,
    },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0 },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'qx7f2m9kpa is not a page of this session. A page ID works only in the session that ' +
      'fetched it, so fetch the page again by its url.',
  });

  expect(readPage).not.toHaveBeenCalled();
});

test('it refuses the page ID of an earlier session, and never returns another page', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(
    () =>
      Promise.resolve({
        kind: 'page',
        retryAfterMs: null,
        isGated: false,
        url: 'https://harbour.test/ferries',
        status: 200,
        contentType: 'text/plain',
        text: 'Ferries leave at nine.',
        links: [],
        isTruncated: false,
        blocked: null,
      }),
    {
      log: ctx.log,
      textBytes: 20_000,
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
    },
  );

  const first = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://harbour.test/ferries' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0 },
      },
    },
  );

  invariant(first.status === 'ok' && typeof first.result['page'] === 'string');

  const page = first.result['page'];

  const outcome = await tool.run(
    { callID: 'call-2', tool: 'web_fetch', input: { page, part: 1 }, toolUseID: null },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-b', invalidatedThrough: 0 },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      `${page} is not a page of this session. A page ID works only in the session that ` +
      'fetched it, so fetch the page again by its url.',
  });
});

test("it refuses a page ID the store limit removed, once the session's newer pages filled it", async () => {
  const ctx = await setupTest();

  const pages: Readonly<Record<string, FetchReply>> = {
    'https://harbour.test/a': {
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: 'https://harbour.test/a',
      status: 200,
      contentType: 'text/plain',
      text: 'Pier one is open.',
      links: [],
      isTruncated: false,
      blocked: null,
    },
    'https://harbour.test/b': {
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: 'https://harbour.test/b',
      status: 200,
      contentType: 'text/plain',
      text: 'Pier two is open.',
      links: [],
      isTruncated: false,
      blocked: null,
    },
  };

  const tool = buildWebFetchTool(
    (url) =>
      Promise.resolve(pages[url] ?? { kind: 'failed', reason: 'no such page', isGated: false }),
    { log: ctx.log, textBytes: 20_000, linkPathChars: 24, pageStoreBytes: 20, imageLongEdge: 1568 },
  );

  const run = {
    runID: 'conversation',
    thread: 'conversation',
    tools: ['web_fetch'],
    model: { model: 'model-a', profile: 'chat-direct' },
    session: { key: 'session-a', invalidatedThrough: 0 },
  };

  const oldest = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://harbour.test/a' },
      toolUseID: null,
    },
    { run },
  );

  const newest = await tool.run(
    {
      callID: 'call-2',
      tool: 'web_fetch',
      input: { url: 'https://harbour.test/b' },
      toolUseID: null,
    },
    { run },
  );

  invariant(
    oldest.status === 'ok' &&
      typeof oldest.result['page'] === 'string' &&
      newest.status === 'ok' &&
      typeof newest.result['page'] === 'string',
  );

  const oldestRead = await tool.run(
    {
      callID: 'call-3',
      tool: 'web_fetch',
      input: { page: oldest.result['page'], part: 1 },
      toolUseID: null,
    },
    { run },
  );

  const newestRead = await tool.run(
    {
      callID: 'call-4',
      tool: 'web_fetch',
      input: { page: newest.result['page'], part: 1 },
      toolUseID: null,
    },
    { run },
  );

  expect(oldestRead).toStrictEqual({
    status: 'error',
    message:
      `${oldest.result['page']} is not a page of this session. A page ID works only in the ` +
      'session that fetched it, so fetch the page again by its url.',
  });

  expect(newestRead).toStrictEqual(newest);
});

test('it refuses a page ID given as a link, and names the kind it expected', async () => {
  const ctx = await setupTest();

  const readPage = mock();

  const tool = buildWebFetchTool(readPage, {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const outcome = await tool.run(
    { callID: 'call-1', tool: 'web_fetch', input: { link: 'qx7f2m9kpa' }, toolUseID: null },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0 },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'qx7f2m9kpa is a page ID, not a link ID, so give it as page',
  });

  expect(readPage).not.toHaveBeenCalled();
});

test.each([
  ['a page', { page: 'qx7f2m9kpa', part: 2, find: 'ferries' }],
  ['a url', { url: 'https://harbour.test/ferries', part: 2, find: 'ferries' }],
])(
  'it refuses a call on %s that gives both a part and a find, and fetches nothing',
  async (_, input) => {
    const ctx = await setupTest();

    const readPage = mock();

    const tool = buildWebFetchTool(readPage, {
      log: ctx.log,
      textBytes: 20_000,
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
    });

    const outcome = await tool.run(
      { callID: 'call-1', tool: 'web_fetch', input, toolUseID: null },
      {
        run: {
          runID: 'conversation',
          thread: 'conversation',
          tools: ['web_fetch'],
          model: { model: 'model-a', profile: 'chat-direct' },
          session: { key: 'session-a', invalidatedThrough: 0 },
        },
      },
    );

    expect(outcome).toStrictEqual({ status: 'error', message: 'give part or find, not both' });
    expect(readPage).not.toHaveBeenCalled();
  },
);

test('it refuses a link ID given as a page, and names the kind it expected', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(mock(), {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const outcome = await tool.run(
    { callID: 'call-1', tool: 'web_fetch', input: { page: 'L12', part: 2 }, toolUseID: null },
    {
      run: {
        runID: 'conversation',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0 },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'L12 is a link ID, not a page ID, so give it as link',
  });
});

test('it refuses the page ID of a thread a forget cleared', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(
    () =>
      Promise.resolve({
        kind: 'page',
        retryAfterMs: null,
        isGated: false,
        url: 'https://harbour.test/ferries',
        status: 200,
        contentType: 'text/plain',
        text: 'Ferries leave at nine.',
        links: [],
        isTruncated: false,
        blocked: null,
      }),
    {
      log: ctx.log,
      textBytes: 20_000,
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
    },
  );

  const run = {
    runID: 'conversation',
    thread: 'conversation',
    tools: ['web_fetch'],
    model: { model: 'model-a', profile: 'chat-direct' },
    session: { key: 'session-a', invalidatedThrough: 0 },
  };

  const first = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://harbour.test/ferries' },
      toolUseID: null,
    },
    { run },
  );

  invariant(first.status === 'ok' && typeof first.result['page'] === 'string');

  await removeWebFetchThread(ctx.log, 'conversation');

  const outcome = await tool.run(
    {
      callID: 'call-2',
      tool: 'web_fetch',
      input: { page: first.result['page'], part: 1 },
      toolUseID: null,
    },
    { run },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      `${first.result['page']} is not a page of this session. A page ID works only in the ` +
      'session that fetched it, so fetch the page again by its url.',
  });
});

test('it returns a PNG under the image limit as image content with its media type', async () => {
  const ctx = await setupTest();
  const png = await encodeTestImage({ width: 40, height: 30 }, 'png');

  const fetchSandbox = startFetchSandbox({
    adapter: buildStubSandboxAdapter(
      makeStubFetcher((request) => ({
        kind: 'image',
        retryAfterMs: null,
        isGated: false,
        url: request.url,
        status: 200,
        contentType: 'image/png',
        base64: Buffer.from(png).toString('base64'),
      })),
    ),
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 4096 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const tool = buildWebFetchTool(fetchSandbox.readPage, {
    log: ctx.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://tide-charts.test/harbour.png' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0, reserveImages: () => true },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      url: 'https://tide-charts.test/harbour.png',
      status: 200,
      contentType: 'image/png',
      page: null,
      part: null,
      parts: 0,
      text: null,
      isTruncated: false,
      blocked: null,
      image: { mediaType: 'image/png', width: 40, height: 30 },
    },
    images: [{ mediaType: 'image/png', bytes: expect.any(Uint8Array) }],
  });
});

test('it returns a result with no image, marked truncated, for an image the fetcher cut at the image limit', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(
    () =>
      Promise.resolve({
        kind: 'page',
        retryAfterMs: null,
        isGated: false,
        url: 'https://tide-charts.test/coast.png',
        status: 200,
        contentType: 'image/png',
        text: null,
        links: [],
        isTruncated: true,
        blocked: null,
      }),
    {
      log: ctx.log,
      textBytes: 20_000,
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
    },
  );

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://tide-charts.test/coast.png' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0, reserveImages: () => true },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      url: 'https://tide-charts.test/coast.png',
      status: 200,
      contentType: 'image/png',
      page: null,
      part: null,
      parts: 0,
      text: null,
      isTruncated: true,
      blocked: null,
    },
  });
});

test('it returns an image past the long edge downscaled to fit it', async () => {
  const ctx = await setupTest();
  const png = await encodeTestImage({ width: 3000, height: 1500 }, 'png');

  const tool = buildWebFetchTool(
    () =>
      Promise.resolve({
        kind: 'image',
        retryAfterMs: null,
        isGated: false,
        url: 'https://tide-charts.test/estuary.png',
        status: 200,
        contentType: 'image/png',
        base64: Buffer.from(png).toString('base64'),
      }),
    {
      log: ctx.log,
      textBytes: 20_000,
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
    },
  );

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://tide-charts.test/estuary.png' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0, reserveImages: () => true },
      },
    },
  );

  invariant(outcome.status === 'ok');

  const [image] = outcome.images ?? [];

  invariant(image);

  expect(outcome.result['image']).toStrictEqual({
    mediaType: 'image/png',
    width: 1568,
    height: 784,
  });

  expect(new Bun.Image(image.bytes).metadata()).resolves.toStrictEqual({
    width: 1568,
    height: 784,
    format: 'png',
  });
});

test('it counts the image it returns against the session image budget', async () => {
  const ctx = await setupTest();
  const png = await encodeTestImage({ width: 40, height: 30 }, 'png');

  const reserveImages = mock<(images: readonly ToolImage[]) => boolean>(() => true);

  const tool = buildWebFetchTool(
    () =>
      Promise.resolve({
        kind: 'image',
        retryAfterMs: null,
        isGated: false,
        url: 'https://tide-charts.test/harbour.png',
        status: 200,
        contentType: 'image/png',
        base64: Buffer.from(png).toString('base64'),
      }),
    {
      log: ctx.log,
      textBytes: 20_000,
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
    },
  );

  await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://tide-charts.test/harbour.png' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0, reserveImages },
      },
    },
  );

  expect(reserveImages.mock.calls).toStrictEqual([
    [[{ mediaType: 'image/png', bytes: expect.any(Uint8Array) }]],
  ]);
});

test('it returns an error, with no image, once the session holds as many images as it can take', async () => {
  const ctx = await setupTest();
  const png = await encodeTestImage({ width: 40, height: 30 }, 'png');

  const tool = buildWebFetchTool(
    () =>
      Promise.resolve({
        kind: 'image',
        retryAfterMs: null,
        isGated: false,
        url: 'https://tide-charts.test/harbour.png',
        status: 200,
        contentType: 'image/png',
        base64: Buffer.from(png).toString('base64'),
      }),
    {
      log: ctx.log,
      textBytes: 20_000,
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
    },
  );

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://tide-charts.test/harbour.png' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0, reserveImages: () => false },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'https://tide-charts.test/harbour.png is an image, and this session holds as many images ' +
      'as it can take',
  });
});

test('it returns an error, with no image, for an image fetched under the run token, which holds no session', async () => {
  const ctx = await setupTest();
  const png = await encodeTestImage({ width: 40, height: 30 }, 'png');

  const tool = buildWebFetchTool(
    () =>
      Promise.resolve({
        kind: 'image',
        retryAfterMs: null,
        isGated: false,
        url: 'https://tide-charts.test/harbour.png',
        status: 200,
        contentType: 'image/png',
        base64: Buffer.from(png).toString('base64'),
      }),
    {
      log: ctx.log,
      textBytes: 20_000,
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
    },
  );

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://tide-charts.test/harbour.png' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'https://tide-charts.test/harbour.png is an image, and this call cannot show the model an ' +
      'image',
  });
});

test('it returns an error for an image body that is no image the model can see', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(
    () =>
      Promise.resolve({
        kind: 'image',
        retryAfterMs: null,
        isGated: false,
        url: 'https://tide-charts.test/missing.png',
        status: 404,
        contentType: 'image/png',
        base64: Buffer.from('<html>no such chart</html>').toString('base64'),
      }),
    {
      log: ctx.log,
      textBytes: 20_000,
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
    },
  );

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://tide-charts.test/missing.png' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0, reserveImages: () => true },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'https://tide-charts.test/missing.png sent image/png that is no image the model can see: ' +
      'ERR_IMAGE_UNKNOWN_FORMAT',
  });
});
