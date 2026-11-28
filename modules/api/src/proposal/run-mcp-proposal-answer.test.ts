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
    approveHeld: () => runMcpProposalAnswer(context),
  };
}

test('it approves the server proposal that waits for a passkey on the page, and the server joins', async () => {
  const ctx = await setupTest();
  const answers = await ctx.approveHeld();
  const servers = await ctx.mcp.readServerViews();

  expect([answers, servers.map((server) => server.state)]).toStrictEqual([
    { approved: 1, refused: [] },
    ['added'],
  ]);
});
