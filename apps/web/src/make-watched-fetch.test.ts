import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { makeWatchedFetch } from './make-watched-fetch';
import { buildStubTimer } from './test-utils/build-stub-timer';

function setupTest() {
  const events = new TransformStream<Uint8Array, Uint8Array>();

  return { events, writer: events.writable.getWriter(), timer: buildStubTimer() };
}

test('it fails an event stream that sends nothing for the idle period', async () => {
  const ctx = setupTest();

  const watchedFetch = makeWatchedFetch({
    send: () =>
      Promise.resolve(
        new Response(ctx.events.readable, { headers: { 'content-type': 'text/event-stream' } }),
      ),
    idleMs: 100,
    startTimer: ctx.timer.startTimer,
  });

  const response = await watchedFetch(new Request('http://127.0.0.1/events'));

  ctx.timer.advance(100);

  expect(response.text()).rejects.toThrowWithMessage(
    Error,
    'the event stream sent nothing for 100 ms',
  );
});

test('it keeps an event stream open while its keepalives arrive within the idle period', async () => {
  const ctx = setupTest();

  const watchedFetch = makeWatchedFetch({
    send: () =>
      Promise.resolve(
        new Response(ctx.events.readable, { headers: { 'content-type': 'text/event-stream' } }),
      ),
    idleMs: 100,
    startTimer: ctx.timer.startTimer,
  });

  const response = await watchedFetch(new Request('http://127.0.0.1/events'));

  invariant(response.body);

  const reader = response.body.getReader();

  ctx.timer.advance(60);

  await Promise.all([ctx.writer.write(new TextEncoder().encode(': keepalive\n\n')), reader.read()]);

  ctx.timer.advance(60);

  const [, last] = await Promise.all([
    ctx.writer.write(new TextEncoder().encode('data: {"last":true}\n\n')),
    reader.read(),
  ]);

  expect(new TextDecoder().decode(last.value)).toBe('data: {"last":true}\n\n');
});

test('it passes a response that is not an event stream through unwatched', async () => {
  const ctx = setupTest();

  const watchedFetch = makeWatchedFetch({
    send: () =>
      Promise.resolve(
        new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }),
      ),
    idleMs: 100,
    startTimer: ctx.timer.startTimer,
  });

  const response = await watchedFetch(new Request('http://127.0.0.1/state'));
  const body: unknown = await response.json();

  expect(body).toStrictEqual({ ok: true });
  expect(ctx.timer.countPending()).toBe(0);
});
