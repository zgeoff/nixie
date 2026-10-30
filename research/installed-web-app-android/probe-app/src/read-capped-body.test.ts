import { expect, test } from 'bun:test';
import { readCappedBody } from './read-capped-body.ts';

test('it reads a body within the limit', async () => {
  const body = await readCappedBody(
    new Request('http://probe.test/', { method: 'POST', body: 'hello' }),
    5,
  );

  expect(new TextDecoder().decode(body ?? new Uint8Array())).toBe('hello');
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
    ),
  ).toBeNull();
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

  const body = await readCappedBody(
    new Request('http://probe.test/', { method: 'POST', body: stream }),
    4096,
  );

  expect(body).toBeNull();
  expect(pulls).toBeLessThan(10);
});
