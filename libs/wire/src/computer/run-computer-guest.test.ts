import { expect, test } from 'bun:test';
import { encodeFrame } from '../frame/encode-frame';
import { makeFrameDecoder } from '../frame/make-frame-decoder';
import { decodeComputerGuestFrame } from './decode-computer-guest-frame';
import { encodeComputerMessage } from './encode-computer-message';
import type { ComputerScanAsks } from './run-computer-guest';
import { runComputerGuest } from './run-computer-guest';

function setupTest() {
  const inbound = new TransformStream<Uint8Array, Uint8Array>();

  const writer = inbound.writable.getWriter();
  const decode = makeFrameDecoder(1_000_000);
  const sent: ReturnType<typeof decodeComputerGuestFrame>[] = [];
  const first = Promise.withResolvers<void>();
  const counted: { count: number; resolve: () => void }[] = [];

  return {
    sent,
    waitForFirstFrame: () => first.promise,
    waitForFrames: (count: number) =>
      new Promise<void>((resolve) => {
        counted.push({ count, resolve });

        if (sent.length >= count) {
          resolve();
        }
      }),
    send: (message: Parameters<typeof encodeComputerMessage>[0]) =>
      writer.write(encodeFrame(encodeComputerMessage(message))),
    close: () => writer.close(),
    start: (
      handle: Parameters<typeof runComputerGuest>[1],
      options?: Parameters<typeof runComputerGuest>[3],
    ) =>
      runComputerGuest(
        {
          input: inbound.readable,
          write: (bytes) => {
            for (const message of decode(bytes)) {
              sent.push(decodeComputerGuestFrame(message));
              first.resolve();

              for (const waiter of counted) {
                if (sent.length >= waiter.count) {
                  waiter.resolve();
                }
              }
            }

            return Promise.resolve();
          },
        },
        handle,
        1_000_000,
        options,
      ),
  };
}

test('it answers each request frame with one reply and ends when the input closes', async () => {
  const ctx = setupTest();
  const running = ctx.start(() => Promise.resolve({ kind: 'closed', ok: true }));

  await ctx.send({ op: 'close', tab: 't1' });
  await ctx.send({ op: 'close', tab: 't2' });
  await ctx.close();

  await running;

  expect(ctx.sent).toStrictEqual([
    { kind: 'closed', ok: true },
    { kind: 'closed', ok: true },
  ]);
});

test('it sends a hop frame and waits for the pass before the reply', async () => {
  const ctx = setupTest();

  const running = ctx.start(async (_request, askScan) => {
    await askScan('https://example.org/next');

    return { kind: 'closed', ok: true };
  });

  await ctx.send({ op: 'close', tab: 't1' });
  await ctx.waitForFirstFrame();

  expect(ctx.sent).toStrictEqual([{ kind: 'hop', url: 'https://example.org/next' }]);

  await ctx.send({ kind: 'hop-pass' });
  await ctx.close();

  await running;

  expect(ctx.sent).toStrictEqual([
    { kind: 'hop', url: 'https://example.org/next' },
    { kind: 'closed', ok: true },
  ]);
});

test('it fails the hop of a guest when the server refuses it', async () => {
  const ctx = setupTest();
  const outcomes: string[] = [];

  const running = ctx.start(async (_request, askScan) => {
    await askScan('https://example.org/next').catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'no message';

      outcomes.push(message);
    });

    return { kind: 'closed', ok: true };
  });

  await ctx.send({ op: 'close', tab: 't1' });
  await ctx.waitForFirstFrame();
  await ctx.send({ kind: 'hop-refuse', reason: 'the URL holds a secret' });
  await ctx.close();

  await running;

  expect(outcomes).toStrictEqual(['the URL holds a secret']);
});

test('it sends a hop frame while no request runs and waits for the answer', async () => {
  const ctx = setupTest();
  const asks: { current: ComputerScanAsks | null } = { current: null };

  const running = ctx.start(() => Promise.resolve({ kind: 'closed', ok: true }), {
    onReady: (ready) => {
      asks.current = ready;
    },
  });

  const refused = asks.current?.askScan('https://example.org/later');
  const passed = asks.current?.askScanText('x-note: tide');

  await ctx.waitForFrames(1);
  await ctx.send({ kind: 'hop-refuse', reason: 'the URL holds a secret' });
  await ctx.waitForFrames(2);
  await ctx.send({ kind: 'hop-pass' });

  const settled = await Promise.allSettled([refused, passed]);

  await ctx.close();

  await running;

  expect(ctx.sent).toStrictEqual([
    { kind: 'hop', url: 'https://example.org/later' },
    { kind: 'hop-content', text: 'x-note: tide' },
  ]);

  expect(settled).toStrictEqual([
    { status: 'rejected', reason: new Error('the URL holds a secret') },
    { status: 'fulfilled', value: undefined },
  ]);
});

test('it answers a hop from outside a request while a request is running', async () => {
  const ctx = setupTest();
  const asks: { current: ComputerScanAsks | null } = { current: null };
  const release = Promise.withResolvers<void>();

  const running = ctx.start(
    async () => {
      await release.promise;

      return { kind: 'closed', ok: true };
    },
    {
      onReady: (ready) => {
        asks.current = ready;
      },
    },
  );

  await ctx.send({ op: 'close', tab: 't1' });

  const asked = asks.current?.askScanText('x-note: tide');

  await ctx.waitForFrames(1);
  await ctx.send({ kind: 'hop-pass' });

  await asked;

  release.resolve();

  await ctx.close();

  await running;

  expect(ctx.sent).toStrictEqual([
    { kind: 'hop-content', text: 'x-note: tide' },
    { kind: 'closed', ok: true },
  ]);
});

test('it fails a hop that waits when the input closes', async () => {
  const ctx = setupTest();
  const asks: { current: ComputerScanAsks | null } = { current: null };

  const running = ctx.start(() => Promise.resolve({ kind: 'closed', ok: true }), {
    onReady: (ready) => {
      asks.current = ready;
    },
  });

  const asked = asks.current?.askScan('https://example.org/later');

  await ctx.waitForFrames(1);
  await ctx.close();

  await running;

  await expect(asked).rejects.toThrow('the input closed before the server answered a hop');
});
