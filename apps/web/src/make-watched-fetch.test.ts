import { expect, onTestFinished, test } from 'bun:test';
import { makeWatchedFetch } from './make-watched-fetch';

interface SetupConfig {
  readonly body: () => ReadableStream<Uint8Array> | string;
  readonly contentType: string;
}

// A real server on a loopback port that answers with the body the test gives it.
function setupTest(config: SetupConfig) {
  const server = Bun.serve({
    fetch: () => new Response(config.body(), { headers: { 'content-type': config.contentType } }),
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(() => server.stop(true));

  return { url: `http://127.0.0.1:${server.port}/` };
}

test('it fails an event stream that sends nothing for the idle period', async () => {
  const ctx = setupTest({
    body: () =>
      new ReadableStream({
        start: (controller) => {
          controller.enqueue(new TextEncoder().encode('data: {"first":true}\n\n'));
        },
      }),
    contentType: 'text/event-stream',
  });
  const watchedFetch = makeWatchedFetch({ idleMs: 100 });

  const response = await watchedFetch(new Request(ctx.url));

  expect(response.text()).rejects.toThrowWithMessage(
    Error,
    'the event stream sent nothing for 100 ms',
  );
});

test('it keeps an event stream open while its keepalives arrive', async () => {
  const ctx = setupTest({
    body: () =>
      new ReadableStream({
        start: async (controller) => {
          for (let beat = 0; beat < 6; beat += 1) {
            controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));

            // oxlint-disable-next-line no-await-in-loop -- the keepalive rate is the scenario
            await Bun.sleep(40);
          }
          controller.enqueue(new TextEncoder().encode('data: {"last":true}\n\n'));
          controller.close();
        },
      }),
    contentType: 'text/event-stream',
  });
  const watchedFetch = makeWatchedFetch({ idleMs: 100 });

  const response = await watchedFetch(new Request(ctx.url));

  const body = await response.text();

  expect(body).toEndWith('data: {"last":true}\n\n');
});

test('it passes a response that is not an event stream through unwatched', async () => {
  const ctx = setupTest({ body: () => '{"ok":true}', contentType: 'application/json' });
  const watchedFetch = makeWatchedFetch({ idleMs: 1 });

  const response = await watchedFetch(new Request(ctx.url));

  const body: unknown = await response.json();

  expect(body).toStrictEqual({ ok: true });
});
