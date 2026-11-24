import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildStubTimer } from '../test-utils/build-stub-timer';
import { makeWatchedFetch } from './make-watched-fetch';

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

test('it fails an event stream request that gets no response headers within the idle period', () => {
  const ctx = setupTest();

  const watchedFetch = makeWatchedFetch({
    send: () => new Promise<Response>(() => {}),
    isStreamRequest: () => true,
    idleMs: 100,
    startTimer: ctx.timer.startTimer,
  });

  const sending = watchedFetch(new Request('http://127.0.0.1/events'));

  ctx.timer.advance(100);

  expect(sending).rejects.toThrowWithMessage(Error, 'the event stream sent no response for 100 ms');
});

test('it stops the header timer once the response of an event stream request arrives', async () => {
  const ctx = setupTest();

  const watchedFetch = makeWatchedFetch({
    send: () =>
      Promise.resolve(
        new Response(ctx.events.readable, { headers: { 'content-type': 'text/event-stream' } }),
      ),
    isStreamRequest: () => true,
    idleMs: 100,
    startTimer: ctx.timer.startTimer,
  });

  await watchedFetch(new Request('http://127.0.0.1/events'));

  // only the body's own idle timer is left
  expect(ctx.timer.countPending()).toBe(1);
});

test('it passes the abort of the request on to the send of an event stream request', async () => {
  const ctx = setupTest();

  const caller = new AbortController();

  const sent: AbortSignal[] = [];

  const watchedFetch = makeWatchedFetch({
    send: (_request, init) => {
      if (init?.signal) {
        sent.push(init.signal);
      }

      return Promise.resolve(
        new Response(ctx.events.readable, { headers: { 'content-type': 'text/event-stream' } }),
      );
    },
    isStreamRequest: () => true,
    idleMs: 100,
    startTimer: ctx.timer.startTimer,
  });

  await watchedFetch(new Request('http://127.0.0.1/events', { signal: caller.signal }));

  caller.abort();

  expect(sent.map((signal) => signal.aborted)).toStrictEqual([true]);
});
