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
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 1, textBytes: 100, imageBytes: 100 },
    deniedRanges: [],
    hops: 'none' as const,
  };

  const stdin = new Blob([encodeFrame(encodeFetchMessage(request))]).stream();

  const answer = mock(() => ({ kind: 'refused' as const, reason: 'no', isGated: false }));

  const code = await makeStubFetcher(answer)(stdin, ctx.writer);

  await ctx.writer.close();

  const output = await ctx.output;

  expect(code).toBe(0);
  expect(answer).toHaveBeenCalledExactlyOnceWith(request);

  expect(makeFrameDecoder(1000)(output).map((message) => decodeFetchReply(message))).toStrictEqual([
    { kind: 'refused', reason: 'no', isGated: false },
  ]);
});

test('it rejects when stdin closes before a request', () => {
  const ctx = setupTest();
  const answer = mock(() => ({ kind: 'refused' as const, reason: 'no', isGated: false }));

  expect(makeStubFetcher(answer)(new Blob([]).stream(), ctx.writer)).rejects.toThrowWithMessage(
    Error,
    'stdin closed before a frame',
  );

  expect(answer).not.toHaveBeenCalled();
});

test('it exits 1 with no reply for a crash', async () => {
  const ctx = setupTest();

  const frame = encodeFrame(
    encodeFetchMessage({
      url: 'https://example.com/',
      limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 1, textBytes: 100, imageBytes: 100 },
      deniedRanges: [],
      hops: 'none' as const,
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
      limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 1, textBytes: 100, imageBytes: 100 },
      deniedRanges: [],
      hops: 'none' as const,
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

test('it sends each scripted hop and waits for a frame before the next, then answers', async () => {
  const ctx = setupTest();

  const request = {
    url: 'https://example.com/',
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 100, imageBytes: 100 },
    deniedRanges: [],
    hops: 'ask' as const,
  };

  const stdin = new TransformStream<Uint8Array, Uint8Array>();

  const input = stdin.writable.getWriter();
  const received: string[] = [];

  const guest = makeStubFetcher(() => ({ kind: 'failed', reason: 'done', isGated: true }), {
    hops: ['https://example.com/a', 'https://example.com/b'],
    received,
  });

  const running = guest(stdin.readable, ctx.writer);

  await input.write(encodeFrame(encodeFetchMessage(request)));
  await input.write(encodeFrame(encodeFetchMessage({ kind: 'hop-pass' })));
  await input.write(encodeFrame(encodeFetchMessage({ kind: 'hop-pass' })));

  const code = await running;

  await ctx.writer.close();

  const output = await ctx.output;

  expect(code).toBe(0);

  expect(
    makeFrameDecoder(1000)(output).map((message) => new TextDecoder().decode(message)),
  ).toStrictEqual([
    '{"kind":"hop","url":"https://example.com/a"}',
    '{"kind":"hop","url":"https://example.com/b"}',
    '{"kind":"failed","reason":"done","isGated":true}',
  ]);

  expect(received).toStrictEqual([
    new TextDecoder().decode(encodeFetchMessage(request)),
    '{"kind":"hop-pass"}',
    '{"kind":"hop-pass"}',
  ]);
});
