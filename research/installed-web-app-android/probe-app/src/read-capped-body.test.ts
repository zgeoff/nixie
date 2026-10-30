import { expect, test } from 'bun:test';
import { readCappedBody } from './read-capped-body.ts';

test('it reads a body within the limit', async () => {
  const result = await readCappedBody(
    new Request('http://probe.test/', { method: 'POST', body: 'hello' }),
    5,
    new AbortController().signal,
  );

  expect(result).toStrictEqual({ kind: 'read', body: new TextEncoder().encode('hello') });
});

test('it refuses a declared length over the limit before reading', async () => {
  expect(
    await readCappedBody(
      new Request('http://probe.test/', {
        method: 'POST',
        headers: { 'content-length': '6' },
        body: 'hello!',
      }),
      5,
      new AbortController().signal,
    ),
  ).toStrictEqual({ kind: 'too-large' });
});

test('it stops a streamed body with no declared length once it passes the limit', async () => {
  const chunk = new Uint8Array(1024);
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull: (controller) => {
      pulls += 1;
      controller.enqueue(chunk);
    },
  });

  const result = await readCappedBody(
    new Request('http://probe.test/', { method: 'POST', body: stream }),
    4096,
    new AbortController().signal,
  );

  expect(result).toStrictEqual({ kind: 'too-large' });
  expect(pulls).toBeLessThan(10);
});

test('it stops a body that is still arriving when the deadline passes', async () => {
  const deadline = new AbortController();
  const cancelled: unknown[] = [];
  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => controller.enqueue(new Uint8Array(10)),
    cancel: (reason) => void cancelled.push(reason),
  });
  const reading = readCappedBody(
    new Request('http://probe.test/', { method: 'POST', body: stream }),
    4096,
    deadline.signal,
  );

  deadline.abort();

  expect(await reading).toStrictEqual({ kind: 'too-slow' });
  expect(cancelled).toHaveLength(1);
});

test('it answers a stream that fails before its end as broken', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(new TextEncoder().encode('{"json":'));
      controller.error(new Error('connection reset'));
    },
  });

  const result = await readCappedBody(
    new Request('http://probe.test/', { method: 'POST', body: stream }),
    4096,
    new AbortController().signal,
  );

  expect(result).toStrictEqual({ kind: 'broken' });
});

test('it reads nothing once the deadline has passed', async () => {
  const deadline = new AbortController();

  deadline.abort();

  expect(
    await readCappedBody(
      new Request('http://probe.test/', { method: 'POST', body: 'hello' }),
      4096,
      deadline.signal,
    ),
  ).toStrictEqual({ kind: 'too-slow' });
});
