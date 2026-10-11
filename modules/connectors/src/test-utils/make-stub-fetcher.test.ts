import { expect, mock, test } from 'bun:test';
import {
  decodeFetchReply,
  encodeFetchMessage,
  encodeFrame,
  makeFrameDecoder,
} from '@heynixie/wire';
import { makeStubFetcher } from './make-stub-fetcher';

function setupTest() {
  const stdout = new TransformStream<Uint8Array, Uint8Array>();

  return { writer: stdout.writable.getWriter(), output: new Response(stdout.readable).bytes() };
}

test('it answers one request frame with the reply it picks', async () => {
  const ctx = setupTest();
  const request = {
    url: 'https://example.com/',
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 1, textBytes: 100 },
    deniedRanges: [],
  };
  const stdin = new Blob([encodeFrame(encodeFetchMessage(request))]).stream();
  const answer = mock(() => ({ kind: 'refused' as const, reason: 'no' }));

  const code = await makeStubFetcher(answer)(stdin, ctx.writer);
  await ctx.writer.close();
  const output = await ctx.output;

  expect(code).toBe(0);
  expect(answer).toHaveBeenCalledExactlyOnceWith(request);
  expect(makeFrameDecoder(1000)(output).map((message) => decodeFetchReply(message))).toStrictEqual([
    { kind: 'refused', reason: 'no' },
  ]);
});

test('it exits 1 with no reply for a crash', async () => {
  const ctx = setupTest();
  const frame = encodeFrame(
    encodeFetchMessage({
      url: 'https://example.com/',
      limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 1, textBytes: 100 },
      deniedRanges: [],
    }),
  );
  const guest = makeStubFetcher(() => ({ kind: 'crash' }));

  const code = await guest(new Blob([frame]).stream(), ctx.writer);
  await ctx.writer.close();
  const output = await ctx.output;

  expect(code).toBe(1);
  expect(output).toHaveLength(0);
});

test('it writes a frame that holds no fetch reply for garbage', async () => {
  const ctx = setupTest();
  const frame = encodeFrame(
    encodeFetchMessage({
      url: 'https://example.com/',
      limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 1, textBytes: 100 },
      deniedRanges: [],
    }),
  );
  const guest = makeStubFetcher(() => ({ kind: 'garbage' }));

  await guest(new Blob([frame]).stream(), ctx.writer);
  await ctx.writer.close();
  const output = await ctx.output;
  const messages = makeFrameDecoder(1000)(output).map((message) =>
    new TextDecoder().decode(message),
  );

  expect(messages).toStrictEqual(['not json']);
});
