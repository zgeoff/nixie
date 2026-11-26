import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { startStandInMcpLoopback } from './start-stand-in-mcp-loopback';

test('it serves the authorization server metadata over http at its own loopback origin', async () => {
  const site = startStandInMcpLoopback();

  onTestFinished(() => site.stop());

  const response = await fetch(`${site.origin}/.well-known/oauth-authorization-server`);
  const body: unknown = await response.json();

  const metadata = z.object({ issuer: z.string() }).parse(body);

  expect([site.origin.startsWith('http://127.0.0.1:'), metadata.issuer]).toStrictEqual([
    true,
    site.origin,
  ]);
});

test('it refuses an mcp request that holds no token', async () => {
  const site = startStandInMcpLoopback();

  onTestFinished(() => site.stop());

  const unauthorised = await fetch(site.mcpURL, { method: 'POST', body: '{}' });

  expect(unauthorised.status).toBe(401);
});
