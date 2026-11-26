import { expect, test } from 'bun:test';
import { startStandInMcp } from '@heynixie/mcp/test-utils';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();

  const standIn = await startStandInMcp({
    tools: [{ name: 'item_get', description: 'Read one item.', inputSchema: { type: 'object' } }],
    facts: { trusted: true },
  });

  await standIn.approveServer();
  await standIn.signIn(standIn.mcp);
  await standIn.test.allow('tracker.item_get');

  api.setMcp(standIn.mcp);

  return { ...api, standIn };
}

test('#mcp.readNotices tells the owner about a trusted server that changed a tool', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  ctx.standIn.site.setTools([
    { name: 'item_get', description: 'Read one item, newly.', inputSchema: { type: 'object' } },
  ]);

  await ctx.standIn.mcp.list('tracker');

  const read = await buildTestClient(ctx.url, laptop.token).mcp.readNotices({ limit: 10 });

  expect(read.notices).toMatchObject([
    { serverID: 'tracker', tool: 'tracker.item_get', change: 'tool_changed' },
  ]);
});

test('#mcp.readNotices refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const read = buildTestClient(ctx.url, 'no-such-token').mcp.readNotices({ limit: 10 });

  expect(read).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
