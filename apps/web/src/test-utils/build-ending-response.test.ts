import { expect, test } from 'bun:test';
import { buildEndingResponse } from './build-ending-response';

test('it ends the body after the part it got when the stream errors', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(new TextEncoder().encode('event 1\n'));
    },
    pull: (controller) => {
      controller.error(new Error('socket closed'));
    },
  });

  const response = buildEndingResponse(new Response(stream));

  const text = await response.text();

  expect(text).toBe('event 1\n');
});

test('it keeps the status and headers of the response', () => {
  const response = buildEndingResponse(
    new Response('ok', { headers: { 'content-type': 'text/plain' }, status: 201 }),
  );

  expect({
    status: response.status,
    contentType: response.headers.get('content-type'),
  }).toStrictEqual({ status: 201, contentType: 'text/plain' });
});

test('it returns a response with no body as it is', () => {
  const original = new Response(null, { status: 204 });

  expect(buildEndingResponse(original)).toBe(original);
});
