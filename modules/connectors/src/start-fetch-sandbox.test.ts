import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { buildTestClock, makeGatedCall, waitForCondition } from '@heynixie/testing';
import type { FetchRequest } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import type { PageHop } from './gate-page-hops';
import { startFetchSandbox } from './start-fetch-sandbox';
import { buildStubSandboxAdapter } from './test-utils/build-stub-sandbox-adapter';
import { makeStubFetcher } from './test-utils/make-stub-fetcher';

test("it sends the fetcher the URL, the limits and the deployment's ranges, and returns its page", async () => {
  const answer = mock((request: FetchRequest) => ({
    kind: 'page' as const,
    retryAfterMs: null,
    isGated: false,
    url: request.url,
    status: 200,
    contentType: 'text/plain',
    text: 'hello',
    links: [],
    isTruncated: false,
    blocked: null,
  }));

  const adapter = buildStubSandboxAdapter(makeStubFetcher(answer));

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: ['10.96.0.0/12'],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://example.com/');

  expect(reply).toStrictEqual({
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url: 'https://example.com/',
    status: 200,
    contentType: 'text/plain',
    text: 'hello',
    links: [],
    isTruncated: false,
    blocked: null,
  });

  expect(answer).toHaveBeenCalledExactlyOnceWith({
    url: 'https://example.com/',
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: ['10.96.0.0/12'],
    hops: 'none',
  });
});

test('it creates a fetch sandbox with public egress, no grants and no tool route for a fetch', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  await fetchSandbox.readPage('https://example.com/');

  expect(adapter.created).toStrictEqual([
    {
      id: expect.toBeString(),
      spec: {
        kind: 'fetch',
        image: 'nixie-fetch',
        owner: 'web_fetch',
        egress: { kind: 'public' },
        grants: [],
        toolRoute: false,
        limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
      },
    },
  ]);
});

test('it runs two fetches in a row in two different sandboxes, and destroys each when its fetch ends', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  await fetchSandbox.readPage('https://example.com/1');
  await fetchSandbox.readPage('https://example.com/2');

  await waitForCondition(() => adapter.destroyed.length === 2);

  const [first = 'none', second = 'none', ...others] = adapter.created.map((created) => created.id);

  const left = await adapter.list('web_fetch');

  expect(others).toStrictEqual([]);
  expect(first).not.toBe(second);

  expect(adapter.spawned).toStrictEqual([
    { sandboxID: first, argv: ['bun', '/app/fetch.js'] },
    { sandboxID: second, argv: ['bun', '/app/fetch.js'] },
  ]);

  expect(adapter.destroyed).toStrictEqual([first, second]);
  expect(left).toStrictEqual([]);
});

test("it starts the next fetch only once the last fetch's destroy ends, and sweeps a sandbox whose destroy passed its time limit", async () => {
  const clock = buildTestClock(0);

  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
    { destroyFailures: [{ kind: 'hang' }] },
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    sandboxCallTimeoutMs: 30_000,
    clock,
  });

  onTestFinished(() => fetchSandbox.stop());

  await fetchSandbox.readPage('https://example.com/1');

  const second = fetchSandbox.readPage('https://example.com/2');

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(30_000);

  await second;
  await waitForCondition(() => adapter.destroyed.length === 2);

  const [first = 'none', next = 'none', ...others] = adapter.created.map((created) => created.id);

  expect(others).toStrictEqual([]);
  expect(adapter.countMostLive()).toBe(1);
  expect(adapter.destroyed).toStrictEqual([first, next]);
});

test("it returns a fetch's reply before its sandbox's destroy ends", async () => {
  const gate = Promise.withResolvers<void>();

  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
    { destroyFailures: [{ kind: 'wait', until: gate.promise }] },
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
    gate.resolve();
  });

  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://example.com/');

  expect(reply).toMatchObject({ kind: 'page', url: 'https://example.com/' });
  expect(adapter.destroyed).toStrictEqual([]);
});

test('it destroys a sandbox that a create makes after its time limit, as soon as it arrives', async () => {
  const clock = buildTestClock(0);
  const gate = Promise.withResolvers<void>();

  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
    { createFailures: [{ kind: 'wait', until: gate.promise }] },
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    sandboxCallTimeoutMs: 30_000,
    clock,
  });

  onTestFinished(() => fetchSandbox.stop());

  const pending = fetchSandbox.readPage('https://example.com/');

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(30_000);

  const reply = await pending;

  gate.resolve();

  await waitForCondition(() => adapter.destroyed.length === 1);

  const left = await adapter.list('web_fetch');

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: the sandbox call passed its time limit',
    isGated: false,
  });

  expect(adapter.destroyed).toStrictEqual(adapter.created.map((created) => created.id));
  expect(left).toStrictEqual([]);
});

test('it destroys nothing and creates nothing for a fetch whose sweep listed after its time limit', async () => {
  const clock = buildTestClock(0);
  const gate = Promise.withResolvers<void>();

  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
    { listFailures: [{ kind: 'wait', until: gate.promise }] },
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    sandboxCallTimeoutMs: 30_000,
    clock,
  });

  onTestFinished(() => fetchSandbox.stop());

  const stuck = fetchSandbox.readPage('https://example.com/1');

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(30_000);

  await stuck;

  await fetchSandbox.readPage('https://example.com/2');

  const kept = await adapter.create(
    buildMockSandboxSpec({
      kind: 'fetch',
      image: 'nixie-fetch',
      owner: 'web_fetch',
      egress: { kind: 'public' },
      grants: [],
      toolRoute: false,
    }),
  );

  gate.resolve();

  await fetchSandbox.readPage('https://example.com/3');

  await waitForCondition(() => adapter.destroyed.length === 2);

  const [second = 'none', , third = 'none', ...others] = adapter.created.map(
    (created) => created.id,
  );

  const left = await adapter.list('web_fetch');

  expect(others).toStrictEqual([]);
  expect(adapter.destroyed).toStrictEqual([second, third]);
  expect(left.map((sandbox) => sandbox.id)).toStrictEqual([kept.id]);
});

test('it creates nothing for a fetch whose sweep destroyed its leftovers after its time limit', async () => {
  const clock = buildTestClock(0);
  const gate = Promise.withResolvers<void>();

  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
    { destroyFailures: [{ kind: 'wait', until: gate.promise }] },
  );

  const leftover = await adapter.create(
    buildMockSandboxSpec({
      kind: 'fetch',
      image: 'nixie-fetch',
      owner: 'web_fetch',
      egress: { kind: 'public' },
      grants: [],
      toolRoute: false,
    }),
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    sandboxCallTimeoutMs: 30_000,
    clock,
  });

  onTestFinished(() => fetchSandbox.stop());

  const stuck = fetchSandbox.readPage('https://example.com/1');

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(30_000);

  await stuck;

  gate.resolve();

  await fetchSandbox.readPage('https://example.com/2');

  await waitForCondition(() => adapter.destroyed.length === 2);

  const [, next = 'none', ...others] = adapter.created.map((created) => created.id);

  expect(others).toStrictEqual([]);
  expect(adapter.destroyed).toStrictEqual([leftover.id, next]);
});

test('it sweeps before the next fetch after a create that failed, which can leave a sandbox', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
    { createFailures: [{ kind: 'reject', message: 'impd lost the imp it made' }] },
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  await fetchSandbox.readPage('https://example.com/1');

  // the sandbox that the failed create's runtime made and its rollback failed to remove
  const stranded = await adapter.create(
    buildMockSandboxSpec({
      kind: 'fetch',
      image: 'nixie-fetch',
      owner: 'web_fetch',
      egress: { kind: 'public' },
      grants: [],
      toolRoute: false,
    }),
  );

  const reply = await fetchSandbox.readPage('https://example.com/2');

  await waitForCondition(() => adapter.destroyed.length === 2);

  const [, next = 'none', ...others] = adapter.created.map((created) => created.id);

  expect(reply).toMatchObject({ kind: 'page', url: 'https://example.com/2' });
  expect(others).toStrictEqual([]);
  expect(adapter.destroyed).toStrictEqual([stranded.id, next]);
});

test('it lists no sandboxes for a fetch after one whose sandbox it destroyed', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
    {
      listFailures: [
        { kind: 'wait', until: Promise.resolve() },
        { kind: 'reject', message: 'impd is down' },
      ],
    },
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const first = await fetchSandbox.readPage('https://example.com/1');
  const second = await fetchSandbox.readPage('https://example.com/2');

  expect(first).toMatchObject({ kind: 'page', url: 'https://example.com/1' });
  expect(second).toMatchObject({ kind: 'page', url: 'https://example.com/2' });
});

test('it reads a reply whose text and link targets fill their limits with characters JSON escapes', async () => {
  const text = '\u{1}'.repeat(20_000);
  const links = Array.from({ length: 800 }, () => `https://quay.test/?${'\\'.repeat(81)}`);

  const fetchSandbox = startFetchSandbox({
    adapter: buildStubSandboxAdapter(
      makeStubFetcher((request) => ({
        kind: 'page',
        retryAfterMs: null,
        isGated: false,
        url: request.url,
        status: 200,
        contentType: 'text/plain',
        text,
        links,
        isTruncated: true,
        blocked: null,
      })),
    ),
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: {
      bodyBytes: 2_000_000,
      timeoutMs: 1000,
      redirects: 2,
      textBytes: 20_000,
      imageBytes: 2_000_000,
    },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://quay.test/');

  expect(reply).toMatchObject({ kind: 'page', text, links });
});

test('it reads an image reply that fills the image limit, past the size of a reply of text', async () => {
  const base64 = Buffer.alloc(300_000, 0xff).toString('base64');

  const fetchSandbox = startFetchSandbox({
    adapter: buildStubSandboxAdapter(
      makeStubFetcher((request) => ({
        kind: 'image',
        retryAfterMs: null,
        isGated: false,
        url: request.url,
        status: 200,
        contentType: 'image/jpeg',
        base64,
      })),
    ),
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 300_000 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://quay.test/chart.jpg');

  expect(reply).toStrictEqual({
    kind: 'image',
    retryAfterMs: null,
    isGated: false,
    url: 'https://quay.test/chart.jpg',
    status: 200,
    contentType: 'image/jpeg',
    base64,
  });
});

test.each([
  [
    'a failed fetch',
    { kind: 'failed' as const, reason: 'the fetch passed 15000 ms', isGated: false },
    'the fetch passed 15000 ms',
  ],
  [
    'a refused URL',
    {
      kind: 'refused' as const,
      reason: 'only http and https URLs are fetched, not ftp:',
      isGated: false,
    },
    'only http and https URLs are fetched, not ftp:',
  ],
  [
    'a fetcher that exits non-zero',
    { kind: 'crash' as const },
    'the fetch sandbox failed: the fetcher exited with 1',
  ],
])('it destroys the sandbox of a fetch that ends in %s', async (_label, answer, reason) => {
  const adapter = buildStubSandboxAdapter(makeStubFetcher(() => answer));

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://example.com/');

  await waitForCondition(() => adapter.destroyed.length === 1);

  expect(reply).toStrictEqual({
    kind: expect.toBeOneOf(['failed', 'refused']),
    reason,
    isGated: false,
  });

  expect(adapter.created).toHaveLength(1);
  expect(adapter.destroyed).toStrictEqual(adapter.created.map((created) => created.id));
});

test('it destroys the sandbox of a fetch whose reply is not a fetch reply', async () => {
  const adapter = buildStubSandboxAdapter(makeStubFetcher(() => ({ kind: 'garbage' })));

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://example.com/');

  await waitForCondition(() => adapter.destroyed.length === 1);

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: expect.toStartWith('the fetch sandbox failed: '),
    isGated: false,
  });

  expect(adapter.created).toHaveLength(1);
  expect(adapter.destroyed).toStrictEqual(adapter.created.map((created) => created.id));
});

test('it fails a fetch whose fetcher exits with no reply, and destroys its sandbox', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0));

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://example.com/');

  await waitForCondition(() => adapter.destroyed.length === 1);

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: the fetcher closed its output with no reply',
    isGated: false,
  });

  expect(adapter.created).toHaveLength(1);
  expect(adapter.destroyed).toStrictEqual(adapter.created.map((created) => created.id));
});

test('it stops a fetcher that sends no reply in time', async () => {
  const clock = buildTestClock(0);
  const adapter = buildStubSandboxAdapter(makeStubFetcher(() => ({ kind: 'hang' })));

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    replyGraceMs: 500,
    clock,
  });

  onTestFinished(() => fetchSandbox.stop());

  const pending = fetchSandbox.readPage('https://example.com/');

  await waitForCondition(() => adapter.spawned.length === 1);

  clock.advance(1500);

  const reply = await pending;

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: the fetcher passed its time limit',
    isGated: false,
  });
});

test('it destroys the sandbox of a fetch whose fetcher sends no reply in time', async () => {
  const clock = buildTestClock(0);
  const adapter = buildStubSandboxAdapter(makeStubFetcher(() => ({ kind: 'hang' })));

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    replyGraceMs: 500,
    clock,
  });

  onTestFinished(() => fetchSandbox.stop());

  const pending = fetchSandbox.readPage('https://example.com/');

  await waitForCondition(() => adapter.spawned.length === 1);

  clock.advance(1500);

  await pending;
  await waitForCondition(() => adapter.destroyed.length === 1);

  expect(adapter.created).toHaveLength(1);
  expect(adapter.destroyed).toStrictEqual(adapter.created.map((created) => created.id));
});

test('it waits on a fetcher that sends no reply until the time limit passes', async () => {
  const clock = buildTestClock(0);
  const adapter = buildStubSandboxAdapter(makeStubFetcher(() => ({ kind: 'hang' })));

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    replyGraceMs: 500,
    clock,
  });

  onTestFinished(async () => {
    clock.advance(1);

    await fetchSandbox.stop();
  });

  const pending = fetchSandbox.readPage('https://example.com/');

  await waitForCondition(() => adapter.spawned.length === 1);

  clock.advance(1499);

  expect(clock.countSleepers()).toBe(1);
  expect(Bun.peek.status(pending)).toBe('pending');
});

test('it fails a fetch whose time limit passed before its fetcher exited', async () => {
  const sleeps = buildTestClock(0);
  const time = { now: 0 };

  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => {
      time.now = 2500;

      return {
        kind: 'page',
        retryAfterMs: null,
        isGated: false,
        url: request.url,
        status: 200,
        contentType: 'text/plain',
        text: 'hello',
        links: [],
        isTruncated: false,
        blocked: null,
      };
    }),
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    replyGraceMs: 500,
    clock: { now: () => time.now, sleep: sleeps.sleep },
  });

  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://example.com/');

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: the fetcher passed its time limit',
    isGated: false,
  });
});

test('it removes the fetch sandboxes a past process left before it creates one', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
  );

  const leftover = await adapter.create(
    buildMockSandboxSpec({
      kind: 'fetch',
      image: 'nixie-fetch',
      owner: 'web_fetch',
      egress: { kind: 'public' },
      grants: [],
      toolRoute: false,
    }),
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  await fetchSandbox.readPage('https://example.com/');

  await waitForCondition(() => adapter.destroyed.length === 2);

  const [, created = 'none', ...others] = adapter.created.map((sandbox) => sandbox.id);

  expect(others).toStrictEqual([]);
  expect(adapter.destroyed).toStrictEqual([leftover.id, created]);
  expect(adapter.spawned.map((spawn) => spawn.sandboxID)).toStrictEqual([created]);
});

test('it never removes a sandbox of another owner, and creates its own under its owner', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
  );

  const webFetchSandbox = await adapter.create(
    buildMockSandboxSpec({
      kind: 'fetch',
      image: 'nixie-fetch',
      owner: 'web_fetch',
      egress: { kind: 'public' },
      grants: [],
      toolRoute: false,
    }),
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    owner: 'skill_fetch',
  });

  onTestFinished(() => fetchSandbox.stop());

  await fetchSandbox.readPage('https://example.com/');

  await waitForCondition(() => adapter.destroyed.length === 1);

  const [, created] = adapter.created;

  const kept = await adapter.list('web_fetch');

  invariant(created);

  expect(created.spec.owner).toBe('skill_fetch');
  expect(adapter.destroyed).toStrictEqual([created.id]);
  expect(kept.map((sandbox) => sandbox.id)).toStrictEqual([webFetchSandbox.id]);
});

test('it runs one fetch at a time', async () => {
  const fetcher = makeGatedCall(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
  );

  const adapter = buildStubSandboxAdapter(fetcher.call);

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const replies = Promise.all([
    fetchSandbox.readPage('https://example.com/1'),
    fetchSandbox.readPage('https://example.com/2'),
    fetchSandbox.readPage('https://example.com/3'),
  ]);

  await fetcher.started;

  fetcher.release();

  const settled = await replies;

  expect(settled).toMatchObject([{ kind: 'page' }, { kind: 'page' }, { kind: 'page' }]);
  expect(fetcher.countMostRunning()).toBe(1);
});

test('it fails the fetch when the sandbox cannot be created, and tries again on the next', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
    { createFailures: [{ kind: 'reject', message: 'impd is down' }] },
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const failed = await fetchSandbox.readPage('https://example.com/1');
  const second = await fetchSandbox.readPage('https://example.com/2');

  expect(failed).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: impd is down',
    isGated: false,
  });

  expect(second).toMatchObject({ kind: 'page', url: 'https://example.com/2' });
});

test('it fails a fetch whose sandbox never finishes creating', async () => {
  const clock = buildTestClock(0);

  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
    { createFailures: [{ kind: 'hang' }] },
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    sandboxCallTimeoutMs: 30_000,
    clock,
  });

  onTestFinished(() => fetchSandbox.stop());

  const pending = fetchSandbox.readPage('https://example.com/1');

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(30_000);

  const stuck = await pending;

  expect(stuck).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: the sandbox call passed its time limit',
    isGated: false,
  });
});

test('it waits on a sandbox that never finishes creating until the time limit passes', async () => {
  const clock = buildTestClock(0);

  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
    { createFailures: [{ kind: 'hang' }] },
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    sandboxCallTimeoutMs: 30_000,
    clock,
  });

  onTestFinished(async () => {
    clock.advance(1);

    await fetchSandbox.stop();
  });

  const pending = fetchSandbox.readPage('https://example.com/1');

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(29_999);

  expect(clock.countSleepers()).toBe(1);
  expect(Bun.peek.status(pending)).toBe('pending');
});

test('it serves the next fetch after a sandbox that never finished creating', async () => {
  const clock = buildTestClock(0);

  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
    { createFailures: [{ kind: 'hang' }] },
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    sandboxCallTimeoutMs: 30_000,
    clock,
  });

  onTestFinished(() => fetchSandbox.stop());

  const stuck = fetchSandbox.readPage('https://example.com/1');

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(30_000);

  await stuck;

  const next = await fetchSandbox.readPage('https://example.com/2');

  expect(next).toMatchObject({ kind: 'page', url: 'https://example.com/2' });
});

test('it fails a fetch after it stops, and creates no sandbox', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  await fetchSandbox.stop();

  const reply = await fetchSandbox.readPage('https://example.com/');

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox is stopped',
    isGated: false,
  });

  expect(adapter.created).toStrictEqual([]);
});

test("it destroys the last fetch's sandbox before it finishes stopping", async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  await fetchSandbox.readPage('https://example.com/');
  await fetchSandbox.stop();

  expect(adapter.created).toHaveLength(1);
  expect(adapter.destroyed).toStrictEqual(adapter.created.map((created) => created.id));
});

test("it waits on the last fetch's destroy before it finishes stopping", async () => {
  const clock = buildTestClock(0);

  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      links: [],
      isTruncated: false,
      blocked: null,
    })),
    { destroyFailures: [{ kind: 'hang' }] },
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    sandboxCallTimeoutMs: 30_000,
    clock,
  });

  onTestFinished(async () => {
    clock.advance(1);

    await fetchSandbox.stop();
  });

  await fetchSandbox.readPage('https://example.com/');

  const stopping = fetchSandbox.stop();

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(29_999);

  expect(clock.countSleepers()).toBe(1);
  expect(Bun.peek.status(stopping)).toBe('pending');
});

test('it exchanges one hop frame and one hop-pass for each redirect of a gated fetch, on one stream', async () => {
  const received: string[] = [];

  const adapter = buildStubSandboxAdapter(
    makeStubFetcher(
      () => ({
        kind: 'page',
        retryAfterMs: null,
        isGated: true,
        url: 'https://example.com/c',
        status: 200,
        contentType: 'text/plain',
        text: 'hello',
        links: [],
        isTruncated: false,
        blocked: null,
      }),
      { hops: ['https://www.example.com/b', 'https://cdn.example.net/c'], received },
    ),
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const scanned: PageHop[] = [];

  const reply = await fetchSandbox.readPage('https://example.com/a', {
    scanHop: (hop) => {
      scanned.push(hop);

      return Promise.resolve({ kind: 'pass' });
    },
  });

  expect(reply).toStrictEqual({
    kind: 'page',
    retryAfterMs: null,
    isGated: true,
    url: 'https://example.com/c',
    status: 200,
    contentType: 'text/plain',
    text: 'hello',
    links: [],
    isTruncated: false,
    blocked: null,
  });

  expect(scanned).toStrictEqual([
    { number: 1, url: 'https://www.example.com/b', sentBy: 'example.com' },
    { number: 2, url: 'https://cdn.example.net/c', sentBy: 'www.example.com' },
  ]);

  expect(received).toStrictEqual([
    JSON.stringify({
      url: 'https://example.com/a',
      limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 0, textBytes: 50, imageBytes: 100 },
      deniedRanges: [],
      hopGate: { redirects: 2 },
    }),
    '{"kind":"hop-pass"}',
    '{"kind":"hop-pass"}',
  ]);

  expect(adapter.spawned).toHaveLength(1);
});

test('it returns the refusal of a hop and destroys the sandbox', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher(() => ({ kind: 'crash' }), { hops: ['https://www.example.com/b'] }),
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://example.com/a', {
    scanHop: () => Promise.resolve({ kind: 'refuse', reason: 'that URL holds a secret' }),
  });

  await waitForCondition(() => adapter.destroyed.length === 1);

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: 'that URL holds a secret',
    isGated: true,
  });
});

test('it sends a request that is not gated with no hopGate, and fails the fetch on a hop frame', async () => {
  const received: string[] = [];

  const adapter = buildStubSandboxAdapter(
    makeStubFetcher(() => ({ kind: 'crash' }), { hops: ['https://www.example.com/b'], received }),
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://example.com/a');

  expect(received).toStrictEqual([
    JSON.stringify({
      url: 'https://example.com/a',
      limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
      deniedRanges: [],
    }),
  ]);

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: the fetcher asked before a hop of a fetch that is not gated',
    isGated: false,
  });
});

test('it gives a failed reply that is not gated, to a gated fetch, the reason of an older fetch image', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher(() => ({
      kind: 'failed',
      reason: 'the page redirected more than 0 times',
      isGated: false,
    })),
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://example.com/a', {
    scanHop: () => Promise.resolve({ kind: 'pass' }),
  });

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason:
      'the fetch image is of a release before the server and cannot ask before a redirect: the page redirected more than 0 times',
    isGated: false,
  });
});

test.each([
  ['a gated fetch', { scanHop: () => Promise.resolve({ kind: 'pass' as const }) }, true],
  ['a fetch that is not gated', undefined, false],
])('it marks the replies it makes itself for %s', async (_label, options, isGated) => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher(() => ({ kind: 'crash' })),
    {
      createFailures: [{ kind: 'reject', message: 'impd is down' }],
    },
  );

  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50, imageBytes: 100 },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  const createFailure = await fetchSandbox.readPage('https://example.com/a', options);

  await fetchSandbox.stop();

  const stopped = await fetchSandbox.readPage('https://example.com/a', options);

  expect([createFailure, stopped]).toStrictEqual([
    { kind: 'failed', reason: 'the fetch sandbox failed: impd is down', isGated },
    { kind: 'failed', reason: 'the fetch sandbox is stopped', isGated },
  ]);
});
