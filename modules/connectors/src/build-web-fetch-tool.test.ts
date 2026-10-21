import { expect, mock, onTestFinished, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { waitForCondition } from '@heynixie/testing';
import { buildToolRegistry } from '@heynixie/tools';
import type { FetchReply } from '@heynixie/wire';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { buildWebFetchTool } from './build-web-fetch-tool';
import { removeThreadLinks } from './remove-thread-links';
import { startFetchSandbox } from './start-fetch-sandbox';
import { buildStubSandboxAdapter } from './test-utils/build-stub-sandbox-adapter';
import { makeStubFetcher } from './test-utils/make-stub-fetcher';
import { startTestLog } from './test-utils/start-test-log';
import { webFetchDefaults } from './web-fetch-defaults';

async function setupTest() {
  return { log: await startTestLog() };
}

test('it returns the page the fetch sandbox reads at the URL as the typed result', async () => {
  const ctx = await setupTest();

  const fetchSandbox = startFetchSandbox({
    adapter: buildStubSandboxAdapter(
      makeStubFetcher((request) => ({
        kind: 'page',
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
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const tool = buildWebFetchTool(fetchSandbox.readPage, { log: ctx.log, textBytes: 20_000 });

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
    url: 'https://bakery.test/news',
    status: 200,
    contentType: 'text/html',
    text: 'The new loaf \u{E000}0\u{E001} is out.\n\nOther links on this page:\n- Menu \u{E000}1\u{E001}',
    links: ['https://bakery.test/bread', 'https://bakery.test/menu'],
    isTruncated: false,
    blocked: null,
  };

  const tool = buildWebFetchTool(() => Promise.resolve(reply), { log: ctx.log, textBytes: 20_000 });

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

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { text: 'The new loaf [L1] is out.\n\nOther links on this page:\n- Menu [L2]' },
  });
});

test('it gives a URL one ID across the pages of one session', async () => {
  const ctx = await setupTest();

  const pages: Readonly<Record<string, FetchReply>> = {
    'https://bakery.test/news': {
      kind: 'page',
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
    (url) => Promise.resolve(pages[url] ?? { kind: 'failed', reason: 'no such page' }),
    { log: ctx.log, textBytes: 20_000 },
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

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { text: 'Our hours [L3], our menu [L2], the menu again [L2].' },
  });
});

test('it shows the host only for a link that leaves the page site', async () => {
  const ctx = await setupTest();

  const reply: FetchReply = {
    kind: 'page',
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

  const tool = buildWebFetchTool(() => Promise.resolve(reply), { log: ctx.log, textBytes: 20_000 });

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

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { text: 'Fares [L1], the weather [L2 · weather.test] and the old site [L3].' },
  });
});

test('it fetches the page a link ID names, and returns the URL the fetch ended at', async () => {
  const ctx = await setupTest();

  const pages: Readonly<Record<string, FetchReply>> = {
    'https://bakery.test/news': {
      kind: 'page',
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
    Promise.resolve(pages[url] ?? { kind: 'failed' as const, reason: 'no such page' }),
  );

  const tool = buildWebFetchTool(readPage, { log: ctx.log, textBytes: 20_000 });

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

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { url: 'https://bakery.test/breads/sourdough', text: 'Sourdough, baked daily.' },
  });
});

test.each([['L1'], ['l1'], ['[L1]'], [' L1 '], ['[L1 · bakery.test]']])(
  'it reads %p as the ID of link 1',
  async (link) => {
    const ctx = await setupTest();

    const readPage = mock<(url: string) => Promise<FetchReply>>(() =>
      Promise.resolve({
        kind: 'page',
        url: 'https://bakery.test/news',
        status: 200,
        contentType: 'text/html',
        text: 'The new loaf \u{E000}0\u{E001} is out.',
        links: ['https://bakery.test/bread'],
        isTruncated: false,
        blocked: null,
      }),
    );

    const tool = buildWebFetchTool(readPage, { log: ctx.log, textBytes: 20_000 });

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
  },
);

test('it refuses the ID of a link an earlier session numbered, and fetches nothing', async () => {
  const ctx = await setupTest();

  const readPage = mock<(url: string) => Promise<FetchReply>>(() =>
    Promise.resolve({
      kind: 'page',
      url: 'https://bakery.test/news',
      status: 200,
      contentType: 'text/html',
      text: 'The new loaf \u{E000}0\u{E001} is out.',
      links: ['https://bakery.test/bread'],
      isTruncated: false,
      blocked: null,
    }),
  );

  const tool = buildWebFetchTool(readPage, { log: ctx.log, textBytes: 20_000 });

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
      'L1 is not a link from this session. An ID works only in the session whose page showed ' +
      'it, so fetch that page again by its url.',
  });

  expect(readPage).toHaveBeenCalledOnce();
});

test('it refuses a page whose session a forget ended while it was fetched, and numbers no link', async () => {
  const ctx = await setupTest();

  const reply: FetchReply = {
    kind: 'page',
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
  const tool = buildWebFetchTool(readPage, { log: ctx.log, textBytes: 20_000 });

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

  await removeThreadLinks(ctx.log, 'conversation');

  fetched.resolve(reply);

  const outcome = await running;
  const links = await sql`select url from web_fetch_links`.execute(ctx.log.writer.db);

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'the session ended while the page was fetched, so fetch it again by its url',
  });

  expect(links.rows).toStrictEqual([]);
});

test("it numbers a new session's links from 1 again", async () => {
  const ctx = await setupTest();

  const reply: FetchReply = {
    kind: 'page',
    url: 'https://bakery.test/news',
    status: 200,
    contentType: 'text/html',
    text: 'The menu \u{E000}0\u{E001}.',
    links: ['https://bakery.test/menu'],
    isTruncated: false,
    blocked: null,
  };

  const tool = buildWebFetchTool(() => Promise.resolve(reply), { log: ctx.log, textBytes: 20_000 });

  const otherReply: FetchReply = {
    kind: 'page',
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

  expect(outcome).toMatchObject({ status: 'ok', result: { text: 'The menu [L1].' } });
});

test('it keys the links of a call under the run token by the run', async () => {
  const ctx = await setupTest();

  const readPage = mock<(url: string) => Promise<FetchReply>>(() =>
    Promise.resolve({
      kind: 'page',
      url: 'https://bakery.test/news',
      status: 200,
      contentType: 'text/html',
      text: 'The new loaf \u{E000}0\u{E001} is out.',
      links: ['https://bakery.test/bread'],
      isTruncated: false,
      blocked: null,
    }),
  );

  const tool = buildWebFetchTool(readPage, { log: ctx.log, textBytes: 20_000 });

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
])('it refuses a call that gives %s', async (_, input) => {
  const ctx = await setupTest();

  const readPage = mock();
  const tool = buildWebFetchTool(readPage, { log: ctx.log, textBytes: 20_000 });

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
    message: 'give either the url of a page or the ID of a link',
  });

  expect(readPage).not.toHaveBeenCalled();
});

test('it refuses a link that does not read as a link ID', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(mock(), { log: ctx.log, textBytes: 20_000 });

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
    url: 'https://almanac.test/harbours',
    status: 200,
    contentType: 'text/html',
    text,
    links: targets,
    isTruncated: false,
    blocked: null,
  };

  const tool = buildWebFetchTool(() => Promise.resolve(reply), { log: ctx.log, textBytes: 20_000 });

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
  expect(outcome.result['text']).toInclude('Station 9 readings [L10 · coastal-weather.test]');
});

test('it cuts a page whose links to one long off-site host pass the text limit once written out, and marks it truncated', async () => {
  const ctx = await setupTest();

  const host = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.test`;

  const reply: FetchReply = {
    kind: 'page',
    url: 'https://almanac.test/',
    status: 200,
    contentType: 'text/html',
    text: ' \u{E000}0\u{E001}'.repeat(2000),
    links: [`https://${host}/`],
    isTruncated: false,
    blocked: null,
  };

  const tool = buildWebFetchTool(() => Promise.resolve(reply), {
    log: ctx.log,
    textBytes: webFetchDefaults.limits.textBytes,
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'web_fetch',
      input: { url: 'https://almanac.test/' },
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

  expect(Buffer.byteLength(outcome.result['text'])).toBeLessThanOrEqual(
    webFetchDefaults.limits.textBytes,
  );

  expect(outcome.result['isTruncated']).toBeTrue();
});

test('it returns the reason the bot protection blocked a page in a result the schema accepts', async () => {
  const ctx = await setupTest();

  const fetchSandbox = startFetchSandbox({
    adapter: buildStubSandboxAdapter(
      makeStubFetcher((request) => ({
        kind: 'page',
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
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const registered = buildToolRegistry([
    buildWebFetchTool(fetchSandbox.readPage, { log: ctx.log, textBytes: 20_000 }),
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
    url: 'https://site.test/',
    status: 200,
    contentType: 'text/html',
    text: 'Example Domain \u{E000}0\u{E001}',
    links: ['https://other.test/'],
    isTruncated: false,
    blocked: null,
  };

  const registered = buildToolRegistry([
    buildWebFetchTool(() => Promise.resolve(reply), { log: ctx.log, textBytes: 20_000 }),
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
  ['a key the schema lacks', { page: 'https://site.test/' }, false],
])('it checks an input that names %s against the input schema', async (_, input, isValid) => {
  const ctx = await setupTest();

  const registered = buildToolRegistry([
    buildWebFetchTool(mock(), { log: ctx.log, textBytes: 20_000 }),
  ]).findTool('web_fetch');

  invariant(registered);

  expect(registered.parseInput(input).isValid).toBe(isValid);
});

test('it returns a binary page with no text', async () => {
  const ctx = await setupTest();

  const reply: FetchReply = {
    kind: 'page',
    url: 'https://example.com/a.png',
    status: 200,
    contentType: 'image/png',
    text: null,
    links: [],
    isTruncated: false,
    blocked: null,
  };

  const tool = buildWebFetchTool(() => Promise.resolve(reply), { log: ctx.log, textBytes: 20_000 });

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

  expect(outcome).toMatchObject({ status: 'ok', result: { text: null } });
});

test.each([
  ['refused', 'only https URLs are fetched, not http:'],
  ['failed', 'the fetch passed 15000 ms'],
] as const)('it returns a %s fetch as an error with its reason', async (kind, reason) => {
  const ctx = await setupTest();

  const fetchSandbox = startFetchSandbox({
    adapter: buildStubSandboxAdapter(makeStubFetcher(() => ({ kind, reason }))),
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const tool = buildWebFetchTool(fetchSandbox.readPage, { log: ctx.log, textBytes: 20_000 });

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

  const tool = buildWebFetchTool(mock(), { log: ctx.log, textBytes: 20_000 });

  expect(tool.execution).toBe('direct');

  expect(tool.declaration).toMatchObject({
    effects: ['fetch'],
    destinations: [],
    amount: null,
    content: [],
  });
});

test('it marks every result field as outside content', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(mock(), { log: ctx.log, textBytes: 20_000 });

  expect(tool.declaration.results).toStrictEqual({
    url: 'untrusted',
    status: 'untrusted',
    contentType: 'untrusted',
    text: 'untrusted',
    isTruncated: 'untrusted',
    blocked: 'untrusted',
  });
});

test('it endorses only the status code and the truncated mark', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(mock(), { log: ctx.log, textBytes: 20_000 });

  expect(tool.output['properties']).toStrictEqual({
    url: { type: 'string' },
    status: { type: 'integer', 'x-endorsed': true },
    contentType: { type: ['string', 'null'] },
    text: { type: ['string', 'null'] },
    isTruncated: { type: 'boolean', 'x-endorsed': true },
    blocked: { type: ['string', 'null'] },
  });
});

test('it is a tool the registry accepts', async () => {
  const ctx = await setupTest();

  const tool = buildWebFetchTool(mock(), { log: ctx.log, textBytes: 20_000 });

  expect(() => buildToolRegistry([tool])).not.toThrow();
});
