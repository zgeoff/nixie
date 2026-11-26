import { expect, test } from 'bun:test';
import { startStandInMcp } from '@heynixie/mcp/test-utils';
import { runMcpProposalAnswer } from './run-mcp-proposal-answer';

async function setupTest() {
  const standIn = await startStandInMcp({
    tools: [{ name: 'item_get', inputSchema: { type: 'object' } }],
  });

  const context = {
    log: standIn.test.log,
    clock: standIn.test.clock,
    definitions: standIn.test.context.definitions,
  };

  return {
    ...standIn,
    approveHeld: (change: 'server' | 'tool') => runMcpProposalAnswer(context, change),
  };
}

test('it approves the server proposal that waits for a passkey on the page, and the server joins', async () => {
  const ctx = await setupTest();
  const approved = await ctx.approveHeld('server');
  const servers = await ctx.mcp.readServerViews();

  expect([approved, servers.map((server) => server.state)]).toStrictEqual([1, ['added']]);
});

test('it approves nothing of another change', async () => {
  const ctx = await setupTest();
  const approved = await ctx.approveHeld('tool');

  expect(approved).toBe(0);
});

test('it approves the allow proposal of a listed tool', async () => {
  const ctx = await setupTest();

  await ctx.approveHeld('server');
  await ctx.signIn(ctx.mcp);

  const approved = await ctx.approveHeld('tool');
  const servers = await ctx.mcp.readServerViews();

  expect([approved, servers[0]?.tools.map((tool) => tool.state)]).toStrictEqual([1, ['exposed']]);
});
