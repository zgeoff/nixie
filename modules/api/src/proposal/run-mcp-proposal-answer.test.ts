import { expect, test } from 'bun:test';
import { buildToolForm, seedOldAllowProposal, startStandInMcp } from '@heynixie/mcp/test-utils';
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
    seed: {
      refusedAllow: () =>
        seedOldAllowProposal(
          standIn.test.context,
          'tracker',
          buildToolForm({ inputSchema: { type: 'string' } }),
        ),
    },
  };
}

test('it approves the server proposal that waits for a passkey on the page, and the server joins', async () => {
  const ctx = await setupTest();
  const answers = await ctx.approveHeld('server');
  const servers = await ctx.mcp.readServerViews();

  expect([answers, servers.map((server) => server.state)]).toStrictEqual([
    { approved: 1, refused: [] },
    ['added'],
  ]);
});

test('it approves nothing of another change', async () => {
  const ctx = await setupTest();
  const answers = await ctx.approveHeld('tool');

  expect(answers).toStrictEqual({ approved: 0, refused: [] });
});

test('it approves the allow proposal of a listed tool', async () => {
  const ctx = await setupTest();

  await ctx.approveHeld('server');
  await ctx.signIn(ctx.mcp);

  const answers = await ctx.approveHeld('tool');
  const servers = await ctx.mcp.readServerViews();

  expect([answers, servers[0]?.tools.map((tool) => tool.state)]).toStrictEqual([
    { approved: 1, refused: [] },
    ['exposed'],
  ]);
});

test('it counts no approval for an allow whose form the registry refuses, and reports the refusal', async () => {
  const ctx = await setupTest();

  await ctx.approveHeld('server');
  await ctx.seed.refusedAllow();

  const answers = await ctx.approveHeld('tool');

  expect(answers).toStrictEqual({ approved: 0, refused: ['NOT_ALLOWED'] });
});
