import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { encodeFrame } from '../frame/encode-frame';
import { makeFrameDecoder } from '../frame/make-frame-decoder';
import { decodeComputerGuestFrame } from './decode-computer-guest-frame';
import { encodeComputerMessage } from './encode-computer-message';
import { runComputerGuest } from './run-computer-guest';

function setupTest() {
  const inbound = new TransformStream<Uint8Array, Uint8Array>();

  const writer = inbound.writable.getWriter();
  const decode = makeFrameDecoder(1_000_000);
  const sent: ReturnType<typeof decodeComputerGuestFrame>[] = [];

  return {
    sent,
    send: (message: Parameters<typeof encodeComputerMessage>[0]) =>
      writer.write(encodeFrame(encodeComputerMessage(message))),
    close: () => writer.close(),
    start: (handle: Parameters<typeof runComputerGuest>[1]) =>
      runComputerGuest(
        {
          input: inbound.readable,
          write: (bytes) => {
            for (const message of decode(bytes)) {
              sent.push(decodeComputerGuestFrame(message));
            }

            return Promise.resolve();
          },
        },
        handle,
        1_000_000,
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

  await waitForCondition(() => ctx.sent.length === 1);

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

  await waitForCondition(() => ctx.sent.length === 1);

  await ctx.send({ kind: 'hop-refuse', reason: 'the URL holds a secret' });
  await ctx.close();

  await running;

  expect(outcomes).toStrictEqual(['the URL holds a secret']);
});
