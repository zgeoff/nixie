import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildToolRegistry } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildWebFetchTool } from './build-web-fetch-tool';
import { startFetchSandbox } from './start-fetch-sandbox';
import { buildStubSandboxAdapter } from './test-utils/build-stub-sandbox-adapter';
import { makeStubFetcher } from './test-utils/make-stub-fetcher';

test('it returns the page the fetch sandbox reads at the URL as the typed result', async () => {
  const fetchSandbox = startFetchSandbox({
    adapter: buildStubSandboxAdapter(
      makeStubFetcher((request) => ({
        kind: 'page',
        url: request.url,
        status: 200,
        contentType: 'text/html',
        text: 'Example Domain',
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

  const tool = buildWebFetchTool(fetchSandbox.readPage);

  const outcome = await tool.run(
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

test('it returns the reason the bot protection blocked a page in a result the schema accepts', async () => {
  const fetchSandbox = startFetchSandbox({
    adapter: buildStubSandboxAdapter(
      makeStubFetcher((request) => ({
        kind: 'page',
        url: request.url,
        status: 403,
        contentType: 'text/html',
        text: 'Just a moment...',
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

  const registered = buildToolRegistry([buildWebFetchTool(fetchSandbox.readPage)]).findTool(
    'web_fetch',
  );

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
  const fetchSandbox = startFetchSandbox({
    adapter: buildStubSandboxAdapter(
      makeStubFetcher((request) => ({
        kind: 'page',
        url: request.url,
        status: 200,
        contentType: 'text/html',
        text: 'Example Domain',
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

  const registered = buildToolRegistry([buildWebFetchTool(fetchSandbox.readPage)]).findTool(
    'web_fetch',
  );

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

test('it returns a binary page with no text', async () => {
  const fetchSandbox = startFetchSandbox({
    adapter: buildStubSandboxAdapter(
      makeStubFetcher((request) => ({
        kind: 'page',
        url: request.url,
        status: 200,
        contentType: 'image/png',
        text: null,
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

  const tool = buildWebFetchTool(fetchSandbox.readPage);

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

  const tool = buildWebFetchTool(fetchSandbox.readPage);

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

test('it declares only the fetch effect and no destination, so it runs direct', () => {
  const tool = buildWebFetchTool(mock());

  expect(tool.execution).toBe('direct');

  expect(tool.declaration).toMatchObject({
    effects: ['fetch'],
    destinations: [],
    amount: null,
    content: [],
  });
});

test('it marks every result field as outside content', () => {
  const tool = buildWebFetchTool(mock());

  expect(tool.declaration.results).toStrictEqual({
    url: 'untrusted',
    status: 'untrusted',
    contentType: 'untrusted',
    text: 'untrusted',
    isTruncated: 'untrusted',
    blocked: 'untrusted',
  });
});

test('it endorses only the status code and the truncated mark', () => {
  const tool = buildWebFetchTool(mock());

  expect(tool.output['properties']).toStrictEqual({
    url: { type: 'string' },
    status: { type: 'integer', 'x-endorsed': true },
    contentType: { type: ['string', 'null'] },
    text: { type: ['string', 'null'] },
    isTruncated: { type: 'boolean', 'x-endorsed': true },
    blocked: { type: ['string', 'null'] },
  });
});

test('it is a tool the registry accepts', () => {
  const tool = buildWebFetchTool(mock());

  expect(() => buildToolRegistry([tool])).not.toThrow();
});
