import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { startStandInMcpLoopback } from './start-stand-in-mcp-loopback';

function setupTest() {
  const site = startStandInMcpLoopback();

  onTestFinished(() => site.stop());

  return { site };
}

test('it serves the authorization server metadata over http at its own loopback origin', async () => {
  const ctx = setupTest();

  const response = await fetch(`${ctx.site.origin}/.well-known/oauth-authorization-server`);
  const body: unknown = await response.json();

  const metadata = z.object({ issuer: z.string() }).parse(body);

  expect([ctx.site.origin.startsWith('http://127.0.0.1:'), metadata.issuer]).toStrictEqual([
    true,
    ctx.site.origin,
  ]);
});

test('it refuses an mcp request that holds no token', async () => {
  const ctx = setupTest();

  const unauthorised = await fetch(ctx.site.mcpURL, { method: 'POST', body: '{}' });

  expect(unauthorised.status).toBe(401);
});
