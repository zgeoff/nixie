import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import type { FetchRequest } from '@heynixie/wire';
import { startFetchSandbox } from './start-fetch-sandbox';
import { buildStubSandboxAdapter } from './test-utils/build-stub-sandbox-adapter';
import { makeStubFetcher } from './test-utils/make-stub-fetcher';

test("it sends the fetcher the URL, the limits and the deployment's ranges, and returns its page", async () => {
  const answer = mock((request: FetchRequest) => ({
    kind: 'page' as const,
    url: request.url,
    status: 200,
    contentType: 'text/plain',
    text: 'hello',
    isTruncated: false,
  }));
  const adapter = buildStubSandboxAdapter(makeStubFetcher(answer));
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: ['10.96.0.0/12'],
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });
  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://example.com/');

  expect(reply).toStrictEqual({
    kind: 'page',
    url: 'https://example.com/',
    status: 200,
    contentType: 'text/plain',
    text: 'hello',
    isTruncated: false,
  });
  expect(answer).toHaveBeenCalledExactlyOnceWith({
    url: 'https://example.com/',
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: ['10.96.0.0/12'],
  });
});

test('it creates one fetch sandbox with public egress, no grants and no tool route on the first fetch', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      isTruncated: false,
    })),
  );
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
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

test('it runs each fetch in a new fetcher process in the same sandbox', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      isTruncated: false,
    })),
  );
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });
  onTestFinished(() => fetchSandbox.stop());

  await fetchSandbox.readPage('https://example.com/1');
  await fetchSandbox.readPage('https://example.com/2');
  await fetchSandbox.readPage('https://example.com/3');

  const [only = 'none', ...others] = adapter.created.map((created) => created.id);

  expect(others).toStrictEqual([]);
  expect(adapter.spawned).toStrictEqual([
    { sandboxID: only, argv: ['bun', '/app/fetch.js'] },
    { sandboxID: only, argv: ['bun', '/app/fetch.js'] },
    { sandboxID: only, argv: ['bun', '/app/fetch.js'] },
  ]);
});

test('it replaces the sandbox after the configured number of fetches', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      isTruncated: false,
    })),
  );
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 2,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });
  onTestFinished(() => fetchSandbox.stop());

  await fetchSandbox.readPage('https://example.com/1');
  await fetchSandbox.readPage('https://example.com/2');
  await fetchSandbox.readPage('https://example.com/3');
  const [first = 'none', second = 'none', ...others] = adapter.created.map((created) => created.id);

  expect(others).toStrictEqual([]);
  expect(adapter.destroyed).toStrictEqual([first]);
  expect(adapter.spawned.map((spawn) => spawn.sandboxID)).toStrictEqual([first, first, second]);
});

test.each([
  [
    'a failed fetch',
    { kind: 'failed' as const, reason: 'the fetch passed 15000 ms' },
    'the fetch passed 15000 ms',
  ],
  [
    'a refused URL',
    { kind: 'refused' as const, reason: 'only https URLs are fetched, not http:' },
    'only https URLs are fetched, not http:',
  ],
  [
    'a fetcher that exits non-zero',
    { kind: 'crash' as const },
    'the fetch sandbox failed: the fetcher exited with 1',
  ],
])('it replaces the sandbox after %s', async (_label, answer, reason) => {
  const adapter = buildStubSandboxAdapter(makeStubFetcher(() => answer));
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });
  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://example.com/');
  await fetchSandbox.readPage('https://example.com/');
  const ids = adapter.created.map((created) => created.id);

  expect(reply).toStrictEqual({ kind: expect.toBeOneOf(['failed', 'refused']), reason });
  expect(ids).toHaveLength(2);
  expect(adapter.destroyed).toStrictEqual(ids);
});

test('it replaces the sandbox after a reply that is not a fetch reply', async () => {
  const adapter = buildStubSandboxAdapter(makeStubFetcher(() => ({ kind: 'garbage' })));
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });
  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://example.com/');

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: expect.toStartWith('the fetch sandbox failed: '),
  });
  expect(adapter.created).toHaveLength(1);
  expect(adapter.destroyed).toStrictEqual(adapter.created.map((created) => created.id));
});

test('it fails a fetch whose fetcher exits with no reply, and replaces the sandbox', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0));
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });
  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://example.com/');

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: the fetcher closed its output with no reply',
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
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
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
  });
});

test('it replaces the sandbox of a fetcher that sends no reply in time', async () => {
  const clock = buildTestClock(0);
  const adapter = buildStubSandboxAdapter(makeStubFetcher(() => ({ kind: 'hang' })));
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    replyGraceMs: 500,
    clock,
  });
  onTestFinished(() => fetchSandbox.stop());
  const pending = fetchSandbox.readPage('https://example.com/');
  await waitForCondition(() => adapter.spawned.length === 1);

  clock.advance(1500);
  await pending;

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
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
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
      // the time passes while the fetcher answers, with no sleep woken, as a stalled event loop does
      time.now = 2500;
      return {
        kind: 'page',
        url: request.url,
        status: 200,
        contentType: 'text/plain',
        text: 'hello',
        isTruncated: false,
      };
    }),
  );
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    replyGraceMs: 500,
    clock: { now: () => time.now, sleep: sleeps.sleep },
  });
  onTestFinished(() => fetchSandbox.stop());

  const reply = await fetchSandbox.readPage('https://example.com/');

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: the fetcher passed its time limit',
  });
});

test('it removes the fetch sandboxes a past process left before it creates one', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      isTruncated: false,
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
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });
  onTestFinished(() => fetchSandbox.stop());

  await fetchSandbox.readPage('https://example.com/');

  const [, created = 'none', ...others] = adapter.created.map((sandbox) => sandbox.id);

  expect(others).toStrictEqual([]);
  expect(adapter.destroyed).toStrictEqual([leftover.id]);
  expect(adapter.spawned.map((spawn) => spawn.sandboxID)).toStrictEqual([created]);
});

test('it runs one fetch at a time', async () => {
  const running = { now: 0, most: 0, gate: Promise.withResolvers<void>() };
  const adapter = buildStubSandboxAdapter(async (stdin, stdout) => {
    running.now += 1;
    running.most = Math.max(running.most, running.now);
    await running.gate.promise;
    running.now -= 1;
    return makeStubFetcher((request) => ({
      kind: 'page',
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      isTruncated: false,
    }))(stdin, stdout);
  });
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });
  onTestFinished(() => fetchSandbox.stop());

  const replies = Promise.all([
    fetchSandbox.readPage('https://example.com/1'),
    fetchSandbox.readPage('https://example.com/2'),
    fetchSandbox.readPage('https://example.com/3'),
  ]);
  await waitForCondition(() => running.now === 1);

  running.gate.resolve();
  const settled = await replies;

  expect(settled).toMatchObject([{ kind: 'page' }, { kind: 'page' }, { kind: 'page' }]);
  expect(running.most).toBe(1);
});

test('it fails the fetch when the sandbox cannot be created, and tries again on the next', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      isTruncated: false,
    })),
    { createFailures: [{ kind: 'reject', message: 'impd is down' }] },
  );
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });
  onTestFinished(() => fetchSandbox.stop());

  const failed = await fetchSandbox.readPage('https://example.com/1');
  const second = await fetchSandbox.readPage('https://example.com/2');

  expect(failed).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: impd is down',
  });
  expect(second).toMatchObject({ kind: 'page', url: 'https://example.com/2' });
});

test('it fails a fetch whose sandbox never finishes creating', async () => {
  const clock = buildTestClock(0);
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      isTruncated: false,
    })),
    { createFailures: [{ kind: 'hang' }] },
  );
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
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
  });
});

test('it waits on a sandbox that never finishes creating until the time limit passes', async () => {
  const clock = buildTestClock(0);
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      isTruncated: false,
    })),
    { createFailures: [{ kind: 'hang' }] },
  );
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
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
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      isTruncated: false,
    })),
    { createFailures: [{ kind: 'hang' }] },
  );
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
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
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      isTruncated: false,
    })),
  );
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });
  await fetchSandbox.stop();

  const reply = await fetchSandbox.readPage('https://example.com/');

  expect(reply).toStrictEqual({ kind: 'failed', reason: 'the fetch sandbox is stopped' });
  expect(adapter.created).toStrictEqual([]);
});

test('it destroys the sandbox when it stops', async () => {
  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => ({
      kind: 'page',
      url: request.url,
      status: 200,
      contentType: 'text/plain',
      text: 'hello',
      isTruncated: false,
    })),
  );
  const fetchSandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 50 },
    deniedRanges: [],
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });
  await fetchSandbox.readPage('https://example.com/');

  await fetchSandbox.stop();

  expect(adapter.created).toHaveLength(1);
  expect(adapter.destroyed).toStrictEqual(adapter.created.map((created) => created.id));
});
