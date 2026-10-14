import { expect, onTestFinished, test } from 'bun:test';
import { startStubHTTPToolServer } from './start-stub-http-tool-server';

async function setupTest() {
  const tools = await startStubHTTPToolServer();

  onTestFinished(() => tools.stop());

  return { tools };
}

test('it serves the nixie MCP server over Streamable HTTP through its route', async () => {
  const ctx = await setupTest();

  const response = await fetch(ctx.tools.config.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.0.0' },
      },
    }),
  });

  const body = await response.text();

  expect(response.status).toBe(200);
  expect(body).toInclude('"serverInfo":{"name":"nixie"');
});

test('it resets each connection while it drops connections, and counts each reset', async () => {
  const ctx = await setupTest();

  ctx.tools.dropConnections();

  expect(fetch(ctx.tools.config.url, { method: 'POST', body: '{}' })).rejects.toMatchObject({
    code: 'ECONNRESET',
  });
  expect(ctx.tools.resets()).toBeGreaterThanOrEqual(1);
});

test('it relays connections again once the test accepts them', async () => {
  const ctx = await setupTest();

  ctx.tools.dropConnections();
  await ctx.tools.acceptConnections();

  const response = await fetch(ctx.tools.config.url, { method: 'GET' });

  // the stateless server answers a GET itself, so the request crossed the route
  expect(response.status).toBe(405);
  expect(ctx.tools.resets()).toBe(0);
});
