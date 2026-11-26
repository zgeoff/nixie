import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { startStandInMcp } from '@heynixie/mcp/test-utils';
import { readProposal } from '@heynixie/proposals';
import { describeToolState } from '@heynixie/web/describe-tool-state';
import invariant from 'tiny-invariant';

async function setupTest() {
  const standIn = await startStandInMcp({
    tools: [{ name: 'item_get', description: 'Read one item.', inputSchema: { type: 'object' } }],
    facts: { trusted: true },
  });

  await standIn.approveServer();
  await standIn.signIn(standIn.mcp);

  const readTools = async () => {
    const views = await standIn.mcp.readServerViews();

    return views[0]?.tools ?? [];
  };

  return {
    ...standIn,
    readToolLabels: async () => {
      const tools = await readTools();

      return tools.map((tool) => describeToolState(tool));
    },
    lapseToolProposal: async () => {
      const [tool] = await readTools();

      invariant(tool?.proposalID, 'the tool waits for an allow');

      const proposal = await readProposal(standIn.test.log.writer.db, tool.proposalID);

      invariant(proposal, 'the proposal exists');

      await withWriteTransaction(standIn.test.log.writer, async (tx) => {
        await standIn.mcp.makeProposalHandler().lapse(tx, proposal);
      });
    },
  };
}

test('it stops labelling a tool as waiting for approval once its proposal lapsed', async () => {
  const ctx = await setupTest();
  const before = await ctx.readToolLabels();

  await ctx.lapseToolProposal();

  const after = await ctx.readToolLabels();

  expect([before, after]).toStrictEqual([
    ['Hidden: waits for your approval'],
    ['Hidden: not allowed'],
  ]);
});
