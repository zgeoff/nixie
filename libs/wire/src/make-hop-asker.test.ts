import { expect, test } from 'bun:test';
import { decodeFetchGuestFrame } from './decode-fetch-guest-frame';
import { encodeFetchMessage } from './encode-fetch-message';
import { makeFrameDecoder } from './make-frame-decoder';
import { makeHopAsker } from './make-hop-asker';

function setupTest(replies: readonly Uint8Array[]) {
  const written: Uint8Array[] = [];
  const queue = [...replies];
  const closed = Promise.withResolvers<IteratorResult<Uint8Array>>();
  const writeState = { gate: Promise.resolve() };

  const frames: AsyncIterator<Uint8Array> = {
    next: () => {
      const reply = queue.shift();

      return reply === undefined ? closed.promise : Promise.resolve({ done: false, value: reply });
    },
  };

  const askHop = makeHopAsker({
    frames,
    write: (bytes) => {
      written.push(bytes);

      return writeState.gate;
    },
  });

  return {
    askHop,
    written,
    stallWrites: () => {
      const stalled = Promise.withResolvers<void>();

      writeState.gate = stalled.promise;

      return stalled;
    },
    closeFrames: () => {
      closed.resolve({ done: true, value: undefined });
    },
  };
}

test('it writes a hop frame and resolves on a hop-pass frame', async () => {
  const ctx = setupTest([encodeFetchMessage({ kind: 'hop-pass' })]);

  await ctx.askHop('https://example.com/next', new AbortController().signal);

  const messages = ctx.written.flatMap((bytes) => makeFrameDecoder(1000)(bytes));

  expect(messages.map((message) => decodeFetchGuestFrame(message))).toStrictEqual([
    { kind: 'hop', url: 'https://example.com/next' },
  ]);
});

test('it rejects when the signal aborts while it waits', () => {
  const ctx = setupTest([]);

  const controller = new AbortController();

  const asked = ctx.askHop('https://example.com/next', controller.signal);

  controller.abort(new Error('time is up'));

  expect(asked).rejects.toThrowWithMessage(Error, 'time is up');
});

test('it rejects when the signal aborts while the write is still in flight', () => {
  const ctx = setupTest([encodeFetchMessage({ kind: 'hop-pass' })]);
  const stalled = ctx.stallWrites();

  const controller = new AbortController();

  const asked = ctx.askHop('https://example.com/next', controller.signal);

  controller.abort(new Error('time is up'));

  expect(asked).rejects.toThrowWithMessage(Error, 'time is up');

  stalled.resolve();
});

test('it rejects without writing when the signal aborted before the ask', () => {
  const ctx = setupTest([encodeFetchMessage({ kind: 'hop-pass' })]);
  const asked = ctx.askHop('https://example.com/next', AbortSignal.abort(new Error('early')));

  expect(asked).rejects.toThrowWithMessage(Error, 'early');
  expect(ctx.written).toStrictEqual([]);
});

test('it rejects when the frames end before a pass', () => {
  const ctx = setupTest([]);
  const asked = ctx.askHop('https://example.com/next', new AbortController().signal);

  ctx.closeFrames();

  expect(asked).rejects.toThrowWithMessage(Error, /input closed/u);
});

test.each([
  ['a reply frame', encodeFetchMessage({ kind: 'failed', reason: 'no', isGated: false })],
  ['a frame that is not JSON', new TextEncoder().encode('not json')],
])('it rejects when the next frame is %s', async (_label, frame) => {
  const ctx = setupTest([frame]);

  await expect(ctx.askHop('https://example.com/next', new AbortController().signal)).toReject();
});
