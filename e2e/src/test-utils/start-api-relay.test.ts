import { expect, mock, onTestFinished, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startAPIRelay } from './start-api-relay';

function setupTest() {
  const [firstURL, secondURL] = ['first', 'second'].map((name) => {
    const answerRequest = (request: Request) => {
      const url = new URL(request.url);

      return new Response(`${name} ${request.method} ${url.pathname}${url.search}`);
    };

    const server = Bun.serve({ fetch: answerRequest, hostname: '127.0.0.1', port: 0 });

    onTestFinished(async () => {
      await server.stop(true);
    });

    return `http://127.0.0.1:${server.port}`;
  });

  invariant(firstURL !== undefined && secondURL !== undefined);

  return { relay: startAPIRelay(), firstURL, secondURL };
}

test('it answers 502 before it has a target', async () => {
  const ctx = setupTest();

  const response = await fetch(`${ctx.relay.url}/rpc/sessions/list`, { method: 'POST' });

  expect(response.status).toBe(502);
});

test('it sends each request to its target with its path and query', async () => {
  const ctx = setupTest();

  ctx.relay.retarget(ctx.firstURL);

  const response = await fetch(`${ctx.relay.url}/rpc/records/follow?after=4`, { method: 'POST' });
  const text = await response.text();

  expect(text).toBe('first POST /rpc/records/follow?after=4');
});

test('it sends the requests after a retarget to the new target', async () => {
  const ctx = setupTest();

  ctx.relay.retarget(ctx.firstURL);
  ctx.relay.retarget(ctx.secondURL);

  const response = await fetch(`${ctx.relay.url}/health/ready`);
  const text = await response.text();

  expect(text).toBe('second GET /health/ready');
});

test('it answers 502 while its target is down', async () => {
  const ctx = setupTest();
  const answerProbe = mock(() => new Response(null));
  const probe = Bun.serve({ fetch: answerProbe, hostname: '127.0.0.1', port: 0 });

  await probe.stop(true);

  ctx.relay.retarget(`http://127.0.0.1:${probe.port}`);

  const response = await fetch(`${ctx.relay.url}/health/ready`);

  expect(response.status).toBe(502);
});

test('it ends a stream whose target stops partway, after the part it sent', async () => {
  const ctx = setupTest();

  const answerRequest = mock(
    () =>
      new Response(
        new ReadableStream({
          start: (controller) => {
            controller.enqueue(new TextEncoder().encode('event 1\n'));
          },
        }),
      ),
  );

  const streaming = Bun.serve({ fetch: answerRequest, hostname: '127.0.0.1', port: 0 });

  onTestFinished(async () => {
    await streaming.stop(true);
  });

  ctx.relay.retarget(`http://127.0.0.1:${streaming.port}`);

  const response = await fetch(`${ctx.relay.url}/rpc/records/follow`, { method: 'POST' });

  const reader = response.body?.getReader();

  const first = await reader?.read();

  await streaming.stop(true);

  const after = await reader?.read();

  const firstChunk: unknown = first?.value;

  expect(firstChunk).toStrictEqual(new TextEncoder().encode('event 1\n'));
  expect(after?.done).toBeTrue();
});

test('it stops the relay when the test finishes', () => {
  const ctx = setupTest();

  onTestFinished(async () => {
    const reached = await fetch(`${ctx.relay.url}/health/ready`).then(
      () => true,
      () => false,
    );

    expect(reached).toBeFalse();
  });
});
