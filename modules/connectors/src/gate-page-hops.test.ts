import { expect, mock, test } from 'bun:test';
import type { ExecStream, StreamExit } from '@heynixie/sandbox';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { encodeFetchMessage } from '@heynixie/wire';
import type { HopScan, HopVerdict, PageHop } from './gate-page-hops';
import { gatePageHops } from './gate-page-hops';

function setupTest(exitCode = 0) {
  const clock = buildTestClock(0);
  const queue: (Uint8Array<ArrayBuffer> | null)[] = [];
  const waiting: PromiseWithResolvers<void>[] = [];
  const sent: string[] = [];
  const stops: number[] = [];

  const readNext = async (): Promise<IteratorResult<Uint8Array<ArrayBuffer>>> => {
    while (queue.length === 0) {
      const wait = Promise.withResolvers<void>();

      waiting.push(wait);

      await wait.promise;
    }

    const next = queue.shift();

    return next === null || next === undefined
      ? { done: true, value: undefined }
      : { done: false, value: next };
  };

  const exit: StreamExit = {
    code: exitCode,
    signal: null,
    stderr: { bytes: new Uint8Array(), totalBytes: 0, isCut: false },
  };

  const stream: ExecStream = {
    messages: { [Symbol.asyncIterator]: () => ({ next: readNext }) },
    send: (message) => {
      sent.push(new TextDecoder().decode(message));

      return Promise.resolve();
    },
    exit: Promise.resolve(exit),
    stop: () => {
      stops.push(clock.now());

      return Promise.resolve(exit);
    },
  };

  const push = (frame: Uint8Array<ArrayBuffer> | null): void => {
    queue.push(frame);
    waiting.shift()?.resolve();
  };

  return {
    clock,
    pass: { kind: 'pass' } satisfies HopVerdict,
    stream,
    sent,
    stops,
    pushHop: (url: string) => {
      push(encodeFetchMessage({ kind: 'hop', url }));
    },
    pushReply: (reply: Parameters<typeof encodeFetchMessage>[0]) => {
      push(encodeFetchMessage(reply));
    },
    pushBytes: (text: string) => {
      push(new TextEncoder().encode(text));
    },
    close: () => {
      push(null);
    },
    gate: (scanHop: HopScan, redirects = 3) => ({
      sentURL: 'https://start.test/a',
      redirects,
      scanHop,
      limit: { clock, deadline: 10_000, message: 'the fetcher passed its time limit' },
    }),
  };
}

test('it passes each hop, numbers them from 1, and returns the reply of the fetcher', async () => {
  const ctx = setupTest();
  const scanned: PageHop[] = [];

  const gate = ctx.gate((hop) => {
    scanned.push(hop);

    return Promise.resolve(ctx.pass);
  });

  const gated = gatePageHops(ctx.stream, gate);

  ctx.pushHop('https://mid.test/b');

  await waitForCondition(() => ctx.sent.length === 1);

  ctx.pushHop('https://end.test:8443/c');

  await waitForCondition(() => ctx.sent.length === 2);

  ctx.pushReply({
    kind: 'refused',
    reason: 'the page said no',
    isGated: true,
  });

  const reply = await gated;

  expect(reply).toStrictEqual({ kind: 'refused', reason: 'the page said no', isGated: true });

  expect(scanned).toStrictEqual([
    { number: 1, url: 'https://mid.test/b', sentBy: 'start.test' },
    { number: 2, url: 'https://end.test:8443/c', sentBy: 'mid.test' },
  ]);

  expect(ctx.sent).toStrictEqual(['{"kind":"hop-pass"}', '{"kind":"hop-pass"}']);
  expect(ctx.stops).toStrictEqual([]);
});

test('it sends no hop-pass for a refused hop and stops the fetcher', async () => {
  const ctx = setupTest();

  const gated = gatePageHops(
    ctx.stream,
    ctx.gate(() => Promise.resolve({ kind: 'refuse', reason: 'that URL holds a secret' })),
  );

  ctx.pushHop('https://mid.test/b');

  const reply = await gated;

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: 'that URL holds a secret',
    isGated: true,
  });

  expect(ctx.sent).toStrictEqual([]);
  expect(ctx.stops).toHaveLength(1);
});

test('it fails the fetch and stops the fetcher when the fetcher sends more hop frames than the redirect limit', async () => {
  const ctx = setupTest();
  const scan = mock(() => Promise.resolve(ctx.pass));
  const gated = gatePageHops(ctx.stream, ctx.gate(scan, 1));

  ctx.pushHop('https://mid.test/b');

  await waitForCondition(() => ctx.sent.length === 1);

  ctx.pushHop('https://end.test/c');

  const reply = await gated;

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: the fetcher sent more than 1 hop frames',
    isGated: true,
  });

  expect(scan).toHaveBeenCalledTimes(1);
  expect(ctx.stops).toHaveLength(1);
});

test('it fails the fetch when scanHop throws', async () => {
  const ctx = setupTest();

  const gated = gatePageHops(
    ctx.stream,
    ctx.gate(() => Promise.reject(new Error('the scan broke'))),
  );

  ctx.pushHop('https://mid.test/b');

  const reply = await gated;

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: the hop scan failed: the scan broke',
    isGated: true,
  });

  expect(ctx.stops).toHaveLength(1);
});

test.each([
  ['a frame that is not JSON', 'not json'],
  ['a hop frame with no url', '{"kind":"hop"}'],
  ['a hop whose URL does not parse', '{"kind":"hop","url":"not a url"}'],
])('it fails the fetch on %s', async (_label, frame) => {
  const ctx = setupTest();
  const scan = mock(() => Promise.resolve(ctx.pass));
  const gated = gatePageHops(ctx.stream, ctx.gate(scan));

  ctx.pushBytes(frame);

  const reply = await gated;

  expect(reply).toMatchObject({ kind: 'failed', isGated: true });
  expect(scan).not.toHaveBeenCalled();
  expect(ctx.stops).toHaveLength(1);
});

test('it fails the fetch when the output closes before a reply frame', async () => {
  const ctx = setupTest();

  const gated = gatePageHops(
    ctx.stream,
    ctx.gate(() => Promise.resolve(ctx.pass)),
  );

  ctx.close();

  const reply = await gated;

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: the fetcher closed its output with no reply',
    isGated: true,
  });

  expect(ctx.stops).toHaveLength(1);
});

test('it fails the fetch when the time limit passes while it waits for a frame', async () => {
  const ctx = setupTest();

  const gated = gatePageHops(
    ctx.stream,
    ctx.gate(() => Promise.resolve(ctx.pass)),
  );

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(10_000);

  const reply = await gated;

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: the fetcher passed its time limit',
    isGated: true,
  });

  expect(ctx.stops).toHaveLength(1);
});

test('it fails the fetch when a scan passes the time limit, and ignores its late result', async () => {
  const ctx = setupTest();
  const never = Promise.withResolvers<HopVerdict>();

  const gated = gatePageHops(
    ctx.stream,
    ctx.gate(() => never.promise),
  );

  ctx.pushHop('https://mid.test/b');

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(10_000);

  const reply = await gated;

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: the fetcher passed its time limit',
    isGated: true,
  });

  never.resolve(ctx.pass);

  expect(ctx.sent).toStrictEqual([]);
  expect(ctx.stops).toHaveLength(1);
});

test('it fails the fetch when the fetcher exits non-zero after its reply', async () => {
  const ctx = setupTest(1);

  const gated = gatePageHops(
    ctx.stream,
    ctx.gate(() => Promise.resolve(ctx.pass)),
  );

  ctx.pushReply({ kind: 'failed', reason: 'x', isGated: true });

  const reply = await gated;

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'the fetch sandbox failed: the fetcher exited with 1',
    isGated: true,
  });
});

test('it replaces the reason of a failed reply that is not gated when the fetch allows redirects', async () => {
  const ctx = setupTest();

  const gated = gatePageHops(
    ctx.stream,
    ctx.gate(() => Promise.resolve(ctx.pass)),
  );

  ctx.pushReply({
    kind: 'failed',
    reason: 'the page redirected more than 0 times',
    isGated: false,
  });

  const reply = await gated;

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason:
      'the fetch image is of a release before the server and cannot ask before a redirect: the page redirected more than 0 times',
    isGated: false,
  });
});

test('it keeps the reason of a failed reply that is not gated when the fetch allows no redirects', async () => {
  const ctx = setupTest();

  const gated = gatePageHops(
    ctx.stream,
    ctx.gate(() => Promise.resolve(ctx.pass), 0),
  );

  ctx.pushReply({ kind: 'failed', reason: 'the page failed', isGated: false });

  const reply = await gated;

  expect(reply).toStrictEqual({ kind: 'failed', reason: 'the page failed', isGated: false });
});
