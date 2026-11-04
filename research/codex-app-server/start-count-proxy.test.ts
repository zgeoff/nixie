import { expect, onTestFinished, test } from 'bun:test';
import { startCountProxy } from './start-count-proxy.ts';

function setupTest() {
  const bodies: string[] = [];
  const upstream = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: answerUpstream,
  });

  function answerUpstream(): Response {
    return new Response(bodies.shift() ?? '', { headers: { 'content-type': 'text/event-stream' } });
  }

  const proxy = startCountProxy(`http://127.0.0.1:${upstream.port}`, fetch);

  onTestFinished(async () => {
    await proxy.stop();
    await upstream.stop(true);
  });
  return {
    proxy,
    queueUpstreamBody: (body: string) => {
      bodies.push(body);
    },
    sendModelRequest: async () => {
      const response = await fetch(`${proxy.url}/v1/responses`, { method: 'POST', body: '{}' });

      return { status: response.status, body: await response.text() };
    },
  };
}

test('it passes a model response through and records its usage', async () => {
  const ctx = setupTest();
  const body = 'data: {"type":"response.completed","response":{"usage":{"total_tokens":12}}}\n\n';

  ctx.queueUpstreamBody(body);

  expect(await ctx.sendModelRequest()).toStrictEqual({ status: 200, body });
  await ctx.proxy.waitForCounts();
  expect(ctx.proxy.calls).toStrictEqual([
    {
      method: 'POST',
      path: '/v1/responses',
      upgrade: null,
      status: 200,
      usage: { total_tokens: 12 },
      error: null,
    },
  ]);
});

test('it reports a successful model response with no usage as a count failure', async () => {
  const ctx = setupTest();

  ctx.queueUpstreamBody('data: {"type":"response.created"}\n\n');
  await ctx.sendModelRequest();

  expect(ctx.proxy.waitForCounts()).rejects.toThrow('the proxy could not read 1 usage');
});

test('it refuses a websocket upgrade with 426 and records it', async () => {
  const ctx = setupTest();
  const response = await fetch(`${ctx.proxy.url}/v1/responses`, {
    headers: { upgrade: 'websocket', connection: 'upgrade' },
  });

  expect(response.status).toBe(426);
  expect(ctx.proxy.calls).toStrictEqual([
    {
      method: 'GET',
      path: '/v1/responses',
      upgrade: 'websocket',
      status: 426,
      usage: null,
      error: null,
    },
  ]);
});
